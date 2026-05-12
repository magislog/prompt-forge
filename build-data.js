// 辞典(C:\Users\user\Downloads\イラストプロンプト辞典.txt)を読み込み、
// 翻訳マップを当てて prompt-data.json を生成する。
//
// 取り込み対象:
//   - 1〜5章(本体): 5大分類にそのまま展開
//   - 9章(精度強化カテゴリ): 既存大分類のgroupに統合 (PH9_MAPPING で振り分け)
//   - 10章(服プリセット): 「見た目 > コーデセット」中分類に統合
//   - 6/7/8章: スキップ
//   - 9-11/9-14/9-15/9-16: スキップ
//
// 使い方:
//   cd C:\イラストプロンプト
//   node build-data.js
//
// 後から辞典を更新したり翻訳マップを追加したら再実行すれば反映される。
// 既存のheaderImgs/miniImgs/templatesは保持される(templatesはマスター指示で空)。

const fs = require('fs');
const path = require('path');

const SOURCE_TXT = 'C:\\Users\\user\\Downloads\\イラストプロンプト辞典.txt';
const OUT_JSON = path.join(__dirname, 'prompt-data.json');
const TRANSLATE = require('./translations.js');

// 1〜5章の振り分けルール (base/chara)
function decideSide(majorName, groupId, groupName, subgroupName) {
  if (majorName === '見た目') {
    if (groupId === '1-1') {
      return subgroupName === '人数' ? 'base' : 'chara';
    }
    return 'chara';
  }
  if (majorName === '構図') {
    if (groupId === '2-1' || groupId === '2-2') return 'base';
    if (groupId === '2-3' || groupId === '2-4') return 'chara';
    return 'base';
  }
  return 'base';
}

// 9章のサブグループを既存大分類のどこに統合するか
const PH9_MAPPING = {
  '9-1':  { majorName: '見た目', groupName: '基本属性',           side: 'chara' },
  '9-2':  { majorName: '見た目', groupName: '基本属性',           side: 'chara' },
  '9-3':  { majorName: '見た目', groupName: '顔・表情',           side: 'chara' },
  '9-4':  { majorName: '見た目', groupName: '髪',                 side: 'chara' },
  '9-5':  { majorName: '見た目', groupName: '衣装',               side: 'chara' },
  '9-6':  { majorName: '見た目', groupName: 'アクセサリー・小物', side: 'chara' },
  '9-7':  { majorName: '見た目', groupName: '基本属性',           side: 'chara' },
  '9-8':  { majorName: '環境',   groupName: '場所・背景',         side: 'base'  },
  '9-9':  { majorName: '構図',   groupName: '画面設計',           side: 'base'  },
  '9-10': { majorName: '演出',   groupName: '画風・仕上げ',       side: 'base',  skipSubgroup: ['漫画向けネガティブ'] },
  '9-12': { majorName: '制御',   groupName: '固定指定',           side: 'base',  skipSubgroup: ['差分生成ネガティブ'] },
  '9-13': { majorName: '制御',   groupName: '動画指定',           side: 'base',  skipSubgroup: ['動画生成ネガティブ'], createGroup: true },
};

// 10章: 服プリセット
// 「見た目 > コーデセット」中分類に取り込み、各 10-X を専用サブグループに割り当てる
const PH10_TARGET_MAJOR = '見た目';
const PH10_TARGET_GROUP = 'コーデセット';
const PH10_SIDE = 'chara';
const PH10_MAPPING = {
  '10-1': '現代系',
  '10-2': '制服系',
  '10-3': 'ファンタジー系',
  '10-4': '和風系',
  '10-5': 'SF・近未来系',
  '10-6': 'ステージ・イベント系',
  '10-7': '季節・天候系',
  '10-8': '色・印象別',
};
const MARU = ['①','②','③','④','⑤','⑥','⑦','⑧','⑨','⑩','⑪','⑫','⑬','⑭','⑮'];
function toMaru(n) { return n <= MARU.length ? MARU[n-1] : `(${n})`; }

function tr(en) { return TRANSLATE[en] || en; }

function findOrCreateGroup(majors, majorName, groupName, createIfMissing) {
  const m = majors.find(x => x.name === majorName);
  if (!m) return null;
  let g = m.groups.find(x => x.name === groupName);
  if (!g && createIfMissing) {
    g = { name: groupName, subgroups: [] };
    m.groups.push(g);
  }
  return g || null;
}

function parse(text) {
  const lines = text.split(/\r?\n/);
  const majors = [];

  // パース状態
  let mode = 'idle';   // 'normal'(1-5) / 'phase9' / 'phase10' / 'skip' / 'idle'
  let major = null;
  let group = null;
  let subgroup = null;
  let ph9TargetGroup = null;  // phase9で取り込み先のgroup
  let ph9Cfg = null;          // 現在の9-X設定
  let ph10TargetSubgroup = null;  // phase10で取り込み先のsubgroup
  let ph10CurrentSeries = null;   // 現在の【○○系】
  let ph10SeriesCounter = 0;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line) continue;

    // 大分類見出し: "===" の次の非空行
    if (line.startsWith('===')) {
      let j = i + 1;
      while (j < lines.length && !lines[j].trim()) j++;
      const heading = lines[j] ? lines[j].trim() : '';
      const m = heading.match(/^(\d+)\.\s*(.+)$/);
      if (m) {
        const num = parseInt(m[1], 10);
        if (num >= 1 && num <= 5) {
          mode = 'normal';
          major = { name: m[2], groups: [] };
          majors.push(major);
          group = null; subgroup = null;
        } else if (num === 9) {
          mode = 'phase9';
          major = null;
          group = null; subgroup = null;
          ph9TargetGroup = null; ph9Cfg = null;
        } else if (num === 10) {
          mode = 'phase10';
          major = null;
          group = null; subgroup = null;
          ph10TargetSubgroup = null;
          ph10CurrentSeries = null;
          ph10SeriesCounter = 0;
        } else {
          // 6, 7, 8章はスキップ
          mode = 'skip';
          major = null; group = null; subgroup = null;
          ph9TargetGroup = null; ph9Cfg = null;
          ph10TargetSubgroup = null;
        }
        i = j;
      }
      continue;
    }

    if (mode === 'skip' || mode === 'idle') continue;

    // 中分類見出し: "---" の次の非空行
    if (line.startsWith('---')) {
      let j = i + 1;
      while (j < lines.length && !lines[j].trim()) j++;
      const heading = lines[j] ? lines[j].trim() : '';
      const m = heading.match(/^(\d+-\d+)\.\s*(.+)$/);
      if (m) {
        const id = m[1];
        if (mode === 'normal') {
          const skip = (major.name === '制御' && id === '5-5');
          if (skip) {
            group = null; subgroup = null;
          } else {
            group = { name: m[2], _id: id, subgroups: [] };
            major.groups.push(group);
            subgroup = null;
          }
        } else if (mode === 'phase9') {
          const cfg = PH9_MAPPING[id];
          if (cfg) {
            ph9TargetGroup = findOrCreateGroup(majors, cfg.majorName, cfg.groupName, !!cfg.createGroup);
            ph9Cfg = cfg;
            subgroup = null;
            if (!ph9TargetGroup) {
              console.warn(`[WARN] PH9: 取り込み先が見つかりません ${id} -> ${cfg.majorName}/${cfg.groupName}`);
            }
          } else {
            // 9-11, 9-14, 9-15, 9-16 などはスキップ
            ph9TargetGroup = null;
            ph9Cfg = null;
            subgroup = null;
          }
        } else if (mode === 'phase10') {
          const subgroupName = PH10_MAPPING[id];
          if (subgroupName) {
            const tgtGroup = findOrCreateGroup(majors, PH10_TARGET_MAJOR, PH10_TARGET_GROUP, true);
            if (tgtGroup) {
              let sg = tgtGroup.subgroups.find(s => s.name === subgroupName);
              if (!sg) {
                sg = { name: subgroupName, side: PH10_SIDE, words: [] };
                tgtGroup.subgroups.push(sg);
              }
              ph10TargetSubgroup = sg;
            } else {
              ph10TargetSubgroup = null;
            }
            ph10CurrentSeries = null;
            ph10SeriesCounter = 0;
          } else {
            ph10TargetSubgroup = null;
            ph10CurrentSeries = null;
          }
        }
        i = j;
      }
      continue;
    }

    // サブグループ見出し: 【...】
    const sg = line.match(/^【(.+)】$/);
    if (sg) {
      const name = sg[1];
      if (mode === 'normal') {
        if (!group) continue;
        const side = decideSide(major.name, group._id, group.name, name);
        subgroup = { name, side, words: [] };
        group.subgroups.push(subgroup);
      } else if (mode === 'phase9') {
        if (!ph9TargetGroup || !ph9Cfg) { subgroup = null; continue; }
        if ((ph9Cfg.skipSubgroup || []).includes(name)) { subgroup = null; continue; }
        subgroup = { name, side: ph9Cfg.side, words: [] };
        ph9TargetGroup.subgroups.push(subgroup);
      } else if (mode === 'phase10') {
        if (ph10TargetSubgroup) {
          ph10CurrentSeries = name;
          ph10SeriesCounter = 0;
        }
      }
      continue;
    }

    // 単語(英文字 or 数字で始まる)
    if (/^[a-zA-Z0-9]/.test(line)) {
      if (mode === 'normal') {
        if (!group) continue;
        if (!subgroup) {
          // 【...】なしで単語が来た(5-1等): 中分類名と同名でサブグループ自動作成
          const side = decideSide(major.name, group._id, group.name, group.name);
          subgroup = { name: group.name, side, words: [] };
          group.subgroups.push(subgroup);
        }
        const ja = tr(line);
        subgroup.words.push({ ja, pos: line });
      } else if (mode === 'phase9') {
        if (!subgroup) continue;
        const ja = tr(line);
        subgroup.words.push({ ja, pos: line });
      } else if (mode === 'phase10') {
        if (!ph10TargetSubgroup || !ph10CurrentSeries) continue;
        ph10SeriesCounter++;
        const ja = `${ph10CurrentSeries}${toMaru(ph10SeriesCounter)}`;
        ph10TargetSubgroup.words.push({ ja, pos: line });
      }
    }
  }

  // _id を除去
  for (const m of majors) {
    for (const g of m.groups) {
      delete g._id;
    }
  }
  return majors;
}

// --- 実行 ---
const text = fs.readFileSync(SOURCE_TXT, 'utf8');
const majors = parse(text);

let existing = {};
try {
  existing = JSON.parse(fs.readFileSync(OUT_JSON, 'utf8'));
} catch {}

const output = {
  version: 2,
  majors,
  templates: [],
  headerImgs: Array.isArray(existing.headerImgs) ? existing.headerImgs : [],
  miniImgs: Array.isArray(existing.miniImgs) ? existing.miniImgs : [],
};

fs.writeFileSync(OUT_JSON, JSON.stringify(output, null, 2), 'utf8');

// 統計
let totalWords = 0;
let untranslated = [];
const perMajor = {};
for (const m of majors) {
  perMajor[m.name] = { groups: m.groups.length, words: 0 };
  for (const g of m.groups) {
    for (const sg of g.subgroups) {
      for (const w of sg.words) {
        totalWords++;
        perMajor[m.name].words++;
        if (w.ja === w.pos) untranslated.push(`${m.name} > ${g.name} > ${sg.name}: ${w.pos}`);
      }
    }
  }
}

console.log('=== Build complete ===');
console.log(`Output: ${OUT_JSON}`);
console.log(`Majors: ${majors.length}`);
for (const m of majors) {
  const p = perMajor[m.name];
  console.log(`  - ${m.name}: ${p.groups}グループ / ${p.words}語`);
}
console.log(`Total words: ${totalWords}`);
console.log(`Translated: ${totalWords - untranslated.length}`);
console.log(`Untranslated: ${untranslated.length}`);
if (untranslated.length > 0 && untranslated.length <= 50) {
  console.log('--- Untranslated list ---');
  untranslated.forEach(u => console.log('  ' + u));
} else if (untranslated.length > 50) {
  console.log('--- First 50 untranslated ---');
  untranslated.slice(0, 50).forEach(u => console.log('  ' + u));
}
