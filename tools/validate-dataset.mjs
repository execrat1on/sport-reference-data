#!/usr/bin/env node
/**
 * Проверка датасета. Запускается сама при каждом обновлении репозитория
 * (.github/workflows/validate-dataset.yml) и вручную:
 *
 *   node tools/validate-dataset.mjs
 *
 * Что проверяется:
 *   1. все файлы из описи (data/manifest.json) на месте, размер и отпечаток совпадают;
 *   2. каждый файл данных читается и содержит обязательные поля;
 *   3. число записей в файлах совпадает с описью;
 *   4. ссылки на исследования ведут на существующие записи в references.json;
 *   5. числа в README.md и README.en.md совпадают с описью.
 *
 * Никаких внешних библиотек: скрипт должен работать на чистом Node.
 */
import { readFileSync, existsSync, readdirSync } from 'node:fs';
import { createHash } from 'node:crypto';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const DATA = path.join(ROOT, 'data');

const problems = [];
const fail = (message) => problems.push(message);
const readText = (rel) => readFileSync(path.join(ROOT, rel)).toString('utf8');
const short = (value) => JSON.stringify(value).slice(0, 80);

/** Правило подсчёта записей. Ровно то же, что в scripts/export-dataset.mjs. */
function countRecords(json) {
  if (Array.isArray(json)) return json.length;
  if (Array.isArray(json.items)) return json.items.length;
  for (const key of ['groups', 'topics', 'pairs']) {
    if (Array.isArray(json[key])) {
      return json[key].reduce((n, item) => n + (Array.isArray(item.items) ? item.items.length : 1), 0);
    }
  }
  return null;
}

/** Разбор CSV: логические строки, поля в кавычках не считаются переносами. */
function csvRows(text) {
  const rows = [];
  let cur = '';
  let quoted = false;
  for (const ch of text) {
    if (ch === '"') quoted = !quoted;
    if ((ch === '\n' || ch === '\r') && !quoted) {
      if (cur.trim()) rows.push(cur);
      cur = '';
      continue;
    }
    cur += ch;
  }
  if (cur.trim()) rows.push(cur);
  return rows;
}

// ---------------------------------------------------------------- опись

const manifestRel = 'data/manifest.json';
if (!existsSync(path.join(ROOT, manifestRel))) {
  fail('нет data/manifest.json — без описи проверять нечего');
} else {
  const manifest = JSON.parse(readText(manifestRel));
  for (const field of ['dataset', 'version', 'generated', 'source', 'license', 'counts', 'files']) {
    if (manifest[field] === undefined || manifest[field] === null) fail(`manifest.json: нет поля ${field}`);
  }
  if (typeof manifest.version === 'string' && !/^\d+\.\d+\.\d+$/.test(manifest.version)) {
    fail(`manifest.json: версия «${manifest.version}» не похожа на номер версии`);
  }
  if (typeof manifest.generated === 'string' && !/^\d{4}-\d{2}-\d{2}$/.test(manifest.generated)) {
    fail(`manifest.json: дата «${manifest.generated}» не в виде ГГГГ-ММ-ДД`);
  }
  if (!Array.isArray(manifest.files) || !manifest.files.length) fail('manifest.json: пустой список файлов');

  const listed = new Set();
  for (const entry of manifest.files || []) {
    const name = entry.name;
    if (typeof name !== 'string' || !name || name.includes('/') || name.includes('\\')) {
      fail(`manifest.json: неверное имя файла ${short(name)}`);
      continue;
    }
    if (listed.has(name)) fail(`manifest.json: файл ${name} перечислен дважды`);
    listed.add(name);

    const abs = path.join(DATA, name);
    if (!existsSync(abs)) {
      fail(`нет файла data/${name} — запустите node scripts/export-dataset.mjs`);
      continue;
    }
    const buf = readFileSync(abs);
    if (entry.bytes !== buf.length) fail(`data/${name}: размер ${buf.length} байт, в описи ${entry.bytes}`);
    const digest = createHash('sha256').update(buf).digest('hex');
    if (entry.sha256 !== digest) fail(`data/${name}: отпечаток не совпадает с описью`);
    if (!Number.isInteger(entry.bytes) || !/^[0-9a-f]{64}$/.test(String(entry.sha256))) {
      fail(`data/${name}: в описи неверные размер или отпечаток`);
    }
  }

  for (const name of readdirSync(DATA)) {
    if (name === 'manifest.json' || listed.has(name)) continue;
    fail(`data/${name} есть в каталоге, но не указан в описи`);
  }

  // ------------------------------------------------------------ содержимое

  const json = {};
  for (const entry of manifest.files || []) {
    if (!entry.name.endsWith('.json') || !existsSync(path.join(DATA, entry.name))) continue;
    try {
      json[entry.name] = JSON.parse(readFileSync(path.join(DATA, entry.name), 'utf8'));
    } catch (e) {
      fail(`data/${entry.name}: файл не читается как JSON — ${e.message}`);
      continue;
    }
    if (entry.records !== null && entry.records !== undefined) {
      const actual = countRecords(json[entry.name]);
      if (actual !== entry.records) {
        fail(`data/${entry.name}: записей ${actual}, в описи ${entry.records}`);
      }
    }
  }

  /** Сообщает о недостающих полях, но не больше пяти раз по одному правилу. */
  const requireFields = (items, fields, label) => {
    let shown = 0;
    let total = 0;
    items.forEach((item, index) => {
      const missing = fields.filter((f) => item == null || item[f] === undefined || item[f] === null || item[f] === '');
      if (!missing.length) return;
      total++;
      if (shown < 5) {
        fail(`${label}[${index}]: нет полей ${missing.join(', ')}`);
        shown++;
      }
    });
    if (total > shown) fail(`${label}: ещё ${total - shown} записей с пропусками`);
  };

  const refs = json['references.json'];
  if (refs) {
    requireFields(refs, ['id', 'pmid', 'title', 'journal', 'year', 'level', 'type'], 'references.json');
    const badLevel = refs.filter((r) => !['A', 'B', 'C'].includes(r.level));
    if (badLevel.length) fail(`references.json: уровень доказательности вне A/B/C у ${badLevel.length} записей`);
    const ids = new Set(refs.map((r) => r.id));
    if (ids.size !== refs.length) fail('references.json: есть повторяющиеся id');
  }

  const supplements = json['supplements.json'];
  if (supplements) {
    requireFields(supplements, ['id', 'name', 'category', 'evidence', 'goals', 'doseByGoal', 'refs'], 'supplements.json');
    const bad = supplements.filter((s) => !['A', 'B', 'C'].includes(s.evidence));
    if (bad.length) fail(`supplements.json: уровень доказательности вне A/B/C у ${bad.length} записей`);
    const noDose = supplements.filter((s) => !s.doseByGoal || !Object.keys(s.doseByGoal).length);
    if (noDose.length) fail(`supplements.json: у ${noDose.length} добавок нет дозировок по целям`);
  }

  const exercises = json['exercises.json'];
  if (exercises) {
    if (!Array.isArray(exercises.groups) || !exercises.groups.length) fail('exercises.json: нет групп');
    for (const group of exercises.groups || []) {
      if (!group.id || !Array.isArray(group.items) || !group.items.length) fail(`exercises.json: пустая группа ${short(group.id)}`);
      requireFields(group.items || [], ['name', 'cue'], `exercises.json/${group.id}`);
      for (const item of group.items || []) {
        if (!item.video || !/^https?:\/\//.test(String(item.video.url))) {
          fail(`exercises.json: у «${item.name}» нет рабочей ссылки на видео`);
        }
      }
    }
  }

  const foods = json['foods.json'];
  if (foods) {
    for (const group of foods.groups || []) {
      if (!group.id || !Array.isArray(group.items) || !group.items.length) fail(`foods.json: пустая группа ${short(group.id)}`);
      requireFields(group.items || [], ['name'], `foods.json/${group.id}`);
    }
  }

  const nutrition = json['foods-nutrition.json'];
  if (nutrition) {
    if (!nutrition.source || !nutrition.source.name) fail('foods-nutrition.json: не указан источник');
    requireFields(nutrition.items || [], ['id', 'name', 'sourceId', 'per100g'], 'foods-nutrition.json');
    const badMacro = (nutrition.items || []).filter((x) => !x.per100g || typeof x.per100g.kcal !== 'number');
    if (badMacro.length) fail(`foods-nutrition.json: у ${badMacro.length} продуктов нет калорийности`);
    const noMissingList = (nutrition.items || []).filter((x) => !Array.isArray(x.missing));
    if (noMissingList.length) fail(`foods-nutrition.json: у ${noMissingList.length} продуктов нет списка missing`);
  }

  const gi = json['gi-table.json'];
  if (gi) {
    if (!gi.source || !gi.source.name) fail('gi-table.json: не указан источник');
    requireFields(gi.items || [], ['name', 'nameEn', 'gi'], 'gi-table.json');
    const bad = (gi.items || []).filter((x) => typeof x.gi !== 'number' || x.gi <= 0 || x.gi > 120);
    if (bad.length) fail(`gi-table.json: у ${bad.length} продуктов индекс вне разумных границ`);
  }

  const recipes = json['recipes.json'];
  if (recipes) {
    requireFields(recipes.items || [], ['id', 'title', 'servings', 'ingredients', 'steps'], 'recipes.json');
    const bad = (recipes.items || []).filter((x) => !Array.isArray(x.ingredients) || !x.ingredients.length
      || !Array.isArray(x.steps) || !x.steps.length || !(x.servings > 0));
    if (bad.length) fail(`recipes.json: у ${bad.length} рецептов пустые ингредиенты, шаги или порции`);
    for (const recipe of recipes.items || []) {
      const noCode = (recipe.ingredients || []).filter((i) => i.id === undefined || i.grams === undefined);
      if (noCode.length) fail(`recipes.json/${recipe.id}: у ${noCode.length} ингредиентов нет кода продукта или граммов`);
    }
  }

  const myths = json['myths.json'];
  if (myths) requireFields(myths.items || [], ['id', 'claim', 'verdict', 'refs'], 'myths.json');

  const health = json['health.json'];
  if (health) requireFields(health.topics || [], ['id', 'title', 'summary', 'refs'], 'health.json');

  const symptoms = json['symptoms.json'];
  if (symptoms) {
    if (!symptoms.emergency || !symptoms.emergency.text) fail('symptoms.json: нет памятки о срочной помощи');
    for (const group of symptoms.groups || []) {
      if (!group.id || !Array.isArray(group.items) || !group.items.length) fail(`symptoms.json: пустая группа ${short(group.id)}`);
      requireFields(group.items || [], ['label', 'action'], `symptoms.json/${group.id}`);
    }
  }

  const training = json['training.json'];
  if (training) {
    if (!Array.isArray(training.muscleGroups) || !training.muscleGroups.length) fail('training.json: нет списка групп мышц');
    for (const goal of ['fatloss', 'muscle', 'recomp', 'strength', 'endurance']) {
      if (!training.goals || !training.goals[goal]) fail(`training.json: нет цели ${goal}`);
    }
  }

  const comparisons = json['comparisons.json'];
  if (comparisons) {
    const ids = new Set((supplements || []).map((s) => s.id));
    for (const pair of comparisons.pairs || []) {
      if (!Array.isArray(pair) || pair.length !== 2 || !pair.every((x) => typeof x === 'string')) {
        fail(`comparisons.json: пара ${short(pair)} не состоит из двух добавок`);
        continue;
      }
      for (const id of pair) if (ids.size && !ids.has(id)) fail(`comparisons.json: неизвестная добавка ${id}`);
    }
  }

  // ------------------------------------------------- ссылки на исследования

  if (refs) {
    const known = new Set(refs.map((r) => r.id));
    const used = new Map();
    const collect = (node, where) => {
      if (Array.isArray(node)) {
        for (const item of node) collect(item, where);
        return;
      }
      if (!node || typeof node !== 'object') return;
      for (const [key, value] of Object.entries(node)) {
        if (key === 'refs' && Array.isArray(value)) {
          for (const id of value) {
            if (!used.has(id)) used.set(id, where);
          }
        } else {
          collect(value, where);
        }
      }
    };
    for (const name of ['supplements.json', 'training.json', 'myths.json', 'health.json']) {
      if (json[name]) collect(json[name], name);
    }
    const unknown = [...used.keys()].filter((id) => !known.has(id));
    if (unknown.length) {
      fail(`ссылки на несуществующие исследования: ${unknown.slice(0, 8).map((id) => `${id} (${used.get(id)})`).join(', ')}`);
    }
    console.log(`  ok   ссылки на исследования: ${used.size} использовано, все найдены в references.json`);
  }

  // ----------------------------------------------- числа в README и описи

  const markerRe = /<!--\s*counts:\s*([^>]*?)-->/;
  for (const readme of ['README.md', 'README.en.md']) {
    if (!existsSync(path.join(ROOT, readme))) {
      fail(`нет ${readme} — запустите node scripts/export-dataset.mjs`);
      continue;
    }
    const match = readText(readme).match(markerRe);
    if (!match) {
      fail(`${readme}: не найдена строка с числами (<!-- counts: ... -->)`);
      continue;
    }
    const listed = new Map(match[1].trim().split(/\s+/).map((part) => {
      const [key, value] = part.split('=');
      return [key, Number(value)];
    }));
    const expected = manifest.counts || {};
    for (const [key, value] of Object.entries(expected)) {
      if (listed.get(key) !== value) {
        fail(`${readme}: ${key} — в тексте ${listed.has(key) ? listed.get(key) : 'нет'}, в данных ${value}`);
      }
    }
    for (const key of listed.keys()) {
      if (!(key in expected)) fail(`${readme}: неизвестный счётчик ${key}`);
    }
  }

  console.log(`  ok   опись: ${(manifest.files || []).length} файлов, версия ${manifest.version}, дата ${manifest.generated}`);
}

if (problems.length) {
  console.error('\nДанные не в порядке:');
  problems.slice(0, 40).forEach((p) => console.error('  ✗ ' + p));
  if (problems.length > 40) console.error(`  … и ещё ${problems.length - 40}`);
  process.exit(1);
}
console.log('\nПроверка пройдена: файлы читаются, поля на месте, отпечатки и числа сходятся.');
