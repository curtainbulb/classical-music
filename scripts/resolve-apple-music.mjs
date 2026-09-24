#!/usr/bin/env node
/**
 * scripts/resolve-apple-music.mjs
 *
 * Build-time Apple Music resolution pipeline.
 *
 * WHY THIS EXISTS
 * Apple Music links must point at the *actual, correct* recording, not a
 * guessed URL pattern. This script never fabricates a link. Instead it:
 *
 *   1. Reads every work in data/works.js.
 *   2. Queries Apple's public, unauthenticated iTunes Search API
 *      (https://itunes.apple.com/search) for the named recording, using the
 *      `apple` search string already stored per work (composer + title +
 *      performer — the same string the site uses as a manual fallback).
 *   3. Scores each candidate result against the work's composer, title
 *      keywords, and named performer/orchestra, using simple token overlap.
 *   4. Only accepts a match above a confidence threshold. Anything below
 *      threshold is left unresolved — the site then shows an honest
 *      "search on Apple Music" link instead of a wrong direct one.
 *   5. Writes results to data/apple-music-resolved.json, which the site
 *      layer (js/app.js) prefers over the static appleUrl/appleVerified
 *      fields in works.js when present.
 *
 * WHY THIS DOESN'T RUN IN THIS REPO'S CI BY DEFAULT (yet)
 * The sandbox this project was authored in has an outbound network
 * allowlist that does not include itunes.apple.com or music.apple.com, so
 * this script could not be executed end-to-end during authoring. It is
 * written to run correctly in any environment with normal internet access
 * — a GitHub Actions job, or a developer's machine — and is wired up as an
 * optional workflow step (see .github/workflows/resolve-apple-music.yml).
 * A committed, hand-verified batch already covers the highest-traffic
 * gateway works (see data/works.js `appleVerified: true` entries); running
 * this script extends that coverage to the full 100 without ever guessing.
 *
 * USAGE
 *   node scripts/resolve-apple-music.mjs            # resolve all unresolved works
 *   node scripts/resolve-apple-music.mjs --force     # re-resolve everything
 *   node scripts/resolve-apple-music.mjs --id=b3     # resolve one work
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const WORKS_PATH = path.join(ROOT, 'data', 'works.js');
const OUTPUT_PATH = path.join(ROOT, 'data', 'apple-music-resolved.json');

const CONFIDENCE_THRESHOLD = 0.62; // tuned conservative — false negatives are fine, false positives are not
const REQUEST_DELAY_MS = 350; // be polite to Apple's public endpoint

const args = process.argv.slice(2);
const FORCE = args.includes('--force');
const ONLY_ID = (args.find(a => a.startsWith('--id=')) || '').split('=')[1] || null;

function loadWorks() {
  const src = fs.readFileSync(WORKS_PATH, 'utf8').replace('const WORKS = ', 'module.exports = ');
  const tmp = path.join(ROOT, '.works-tmp.cjs');
  fs.writeFileSync(tmp, src);
  const works = require(tmp);
  fs.unlinkSync(tmp);
  return works;
}

function loadExisting() {
  if (!fs.existsSync(OUTPUT_PATH)) return {};
  try {
    return JSON.parse(fs.readFileSync(OUTPUT_PATH, 'utf8'));
  } catch {
    return {};
  }
}

function tokenize(str) {
  return (str || '')
    .toLowerCase()
    .normalize('NFKD').replace(/[\u0300-\u036f]/g, '') // strip diacritics
    .replace(/[^a-z0-9\s]/g, ' ')
    .split(/\s+/)
    .filter(Boolean);
}

function score(work, candidate) {
  // candidate: { artistName, collectionName, trackName }
  const wantComposer = tokenize(work.composer);
  const wantTitle = tokenize(work.title.split(',')[0].split(':')[0]); // core title, drop catalogue numbers
  const wantPerformer = tokenize(work.best);

  const haveArtist = tokenize(candidate.artistName);
  const haveCollection = tokenize(candidate.collectionName);
  const haveTrack = tokenize(candidate.trackName);
  const haveAll = new Set([...haveArtist, ...haveCollection, ...haveTrack]);

  const overlap = (want) => {
    if (want.length === 0) return 0;
    const hit = want.filter(t => haveAll.has(t)).length;
    return hit / want.length;
  };

  // composer must appear somewhere (surname is the meaningful signal — last token)
  const composerSurname = wantComposer[wantComposer.length - 1];
  const composerHit = haveAll.has(composerSurname) ? 1 : 0;

  const titleScore = overlap(wantTitle);
  const performerScore = overlap(wantPerformer);

  if (composerHit === 0) return 0; // hard requirement — wrong composer is disqualifying

  return 0.15 * composerHit + 0.55 * titleScore + 0.30 * performerScore;
}

async function searchAppleMusic(term) {
  const url = `https://itunes.apple.com/search?media=music&entity=album&limit=10&term=${encodeURIComponent(term)}`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`iTunes Search API returned ${res.status}`);
  const data = await res.json();
  return data.results || [];
}

async function resolveWork(work) {
  const term = work.apple || `${work.composer} ${work.title}`;
  let results;
  try {
    results = await searchAppleMusic(term);
  } catch (err) {
    return { status: 'error', message: String(err) };
  }

  if (results.length === 0) return { status: 'unresolved', reason: 'no results' };

  let best = null;
  let bestScore = 0;
  for (const r of results) {
    const s = score(work, {
      artistName: r.artistName,
      collectionName: r.collectionName,
      trackName: r.trackName || r.collectionName,
    });
    if (s > bestScore) {
      bestScore = s;
      best = r;
    }
  }

  if (!best || bestScore < CONFIDENCE_THRESHOLD) {
    return { status: 'unresolved', reason: 'low confidence', bestScore, candidate: best?.collectionViewUrl };
  }

  return {
    status: 'resolved',
    url: best.collectionViewUrl,
    confidence: Number(bestScore.toFixed(2)),
    matchedAlbum: best.collectionName,
    matchedArtist: best.artistName,
    resolvedAt: new Date().toISOString(),
  };
}

async function main() {
  const works = ONLY_ID ? loadWorks().filter(w => w.id === ONLY_ID) : loadWorks();
  const existing = loadExisting();
  const results = FORCE ? {} : { ...existing };

  let resolvedCount = 0, unresolvedCount = 0, skipped = 0, errored = 0;

  for (const work of works) {
    if (!FORCE && results[work.id]?.status === 'resolved') { skipped++; continue; }

    process.stdout.write(`Resolving ${work.id} — ${work.composer}: ${work.title} ... `);
    const outcome = await resolveWork(work);
    results[work.id] = outcome;

    if (outcome.status === 'resolved') {
      resolvedCount++;
      console.log(`✓ (${outcome.confidence}) ${outcome.matchedAlbum} — ${outcome.matchedArtist}`);
    } else if (outcome.status === 'error') {
      errored++;
      console.log(`✗ error: ${outcome.message}`);
    } else {
      unresolvedCount++;
      console.log(`— unresolved (${outcome.reason})`);
    }

    await new Promise(r => setTimeout(r, REQUEST_DELAY_MS));
  }

  fs.writeFileSync(OUTPUT_PATH, JSON.stringify(results, null, 2) + '\n');
  console.log(`\nDone. resolved=${resolvedCount} unresolved=${unresolvedCount} errored=${errored} skipped=${skipped}`);
  console.log(`Written to ${path.relative(ROOT, OUTPUT_PATH)}`);
}

main();
