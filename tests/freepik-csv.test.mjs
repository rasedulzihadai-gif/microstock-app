import { test } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

// Load the app's ES modules without requiring a separate test runner or changing Next's module configuration.
const asUrl = (source) => `data:text/javascript;base64,${Buffer.from(source).toString("base64")}`;
const rules = asUrl(await readFile(new URL("../lib/enforce-rules.js", import.meta.url), "utf8"));
const csvSource = (await readFile(new URL("../lib/csv.js", import.meta.url), "utf8"))
  .replace('"./enforce-rules"', JSON.stringify(rules));
const { buildFreepikCsv } = await import(asUrl(csvSource));
const { parseMetadataCsv, buildMetadataCsvTemplate } = await import(asUrl(await readFile(new URL("../lib/import-csv.js", import.meta.url), "utf8")));
const item = (filename, importedMetadata = {}) => ({
  filename, importedMetadata,
  result: { platforms: { freepik_vecteezy: { title: 'Friendly robot waving its hand', keywords: ['robot', 'cartoon', 'Robot'] } } },
});

test("Freepik export matches the seven-column semicolon format and round trips", () => {
  const csv = buildFreepikCsv([item('robot.eps', { is_ai: 'yes', ai_prompt: 'A robot; waving\nits hand', ai_model: 'Leonardo' })]);
  assert.equal(csv, 'filename;title;tags;is_ai;ai_prompt;ai_model;people_count\r\nrobot.eps;Friendly robot waving its hand;robot,cartoon;yes;A robot  waving its hand;Leonardo;');
  const parsed = parseMetadataCsv(csv);
  assert.equal(parsed.records[0].tags, 'robot,cartoon');
  assert.equal(parsed.records[0].ai_model, 'Leonardo');
  assert.equal(buildMetadataCsvTemplate(), csv.split('\r\n')[0] + '\r\n');
});

test("AI toggle is a fallback and imported per-file yes/no takes precedence", () => {
  const csv = buildFreepikCsv([item('one.jpg', {is_ai: 'no'}), item('two.jpg', {is_ai: 'yes'}), item('three.jpg')], { aiGenerated: true });
  const records = parseMetadataCsv(csv).records;
  assert.deepEqual(records.map((r) => r.is_ai), ['no', 'yes', 'yes']);
  assert.equal(parseMetadataCsv(buildFreepikCsv([item('one.jpg')])).records[0].is_ai, 'no');
});

test("exports at most 50 keywords without adding a synthetic AI tag", () => {
  const entry = item('file.png');
  entry.result.platforms.freepik_vecteezy.keywords = Array.from({length: 55}, (_, i) => `tag${i}`);
  const record = parseMetadataCsv(buildFreepikCsv([entry], { aiGenerated: true })).records[0];
  assert.equal(record.tags.split(',').length, 50);
  assert.ok(!record.tags.includes('_ai_generated'));
});
