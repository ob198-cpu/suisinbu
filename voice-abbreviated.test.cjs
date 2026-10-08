const assert = require('node:assert/strict');
const { test } = require('node:test');
const { parseTranscript } = require('./form/voice-parser.js');

// 実際に再報告された区切り方を、架空の値で固定する。
const transcript = '報告 試験担当。部署名 営業部会社 架空 建設会社。案件種別 請負。案件を知った日 今日。発生経路 学校紹介者名 不明 紹介者との関係 不明。死亡時期。9月。緊急度 高め';

test('冒頭の報告・部署に連結した会社でも後続項目を振り分ける', () => {
  const result = parseTranscript(transcript);
  for (const [key, value] of Object.entries({
    reporterName: '試験担当', reporterDepartment: '営業部', orgName: '架空 建設会社',
    caseKind: '請負', channel: '学校', referrerName: '不明',
    referrerRelationship: '不明', desiredTime: '9月', urgency: '高'
  })) assert.equal(result.values[key], value, key);
  assert.ok(result.issues.some(item => item.includes('死亡時期') && item.includes('希望時期')), '項目名の補正を確認できる');
  assert.notEqual(result.values.summary, transcript, '構造化口述を丸ごと概要へ入れない');
});

test('明示された今日・本日だけを案件を知った日へ反映する', () => {
  const now = new Date();
  const today = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
  for (const word of ['今日', '本日']) assert.equal(parseTranscript(`案件を知った日 ${word}。`).values.discoveredOn, today);
  for (const word of ['今日か昨日', '9月', '来月', '不明']) assert.equal(Object.hasOwn(parseTranscript(`案件を知った日 ${word}。`).values, 'discoveredOn'), false);
});

test('会社の省略見出しは部署の直後に明確な区切りがある時だけ認識する', () => {
  const result = parseTranscript('報告 試験担当。部署名 営業部。会社 架空株式会社。案件種別 講習。');
  assert.equal(result.values.reporterDepartment, '営業部');
  assert.equal(result.values.orgName, '架空株式会社');
  const department = parseTranscript('報告者 試験担当。部署名 営業部会社支援課。案件種別 講習。');
  assert.equal(department.values.reporterDepartment, '営業部会社支援課');
  assert.equal(Object.hasOwn(department.values, 'orgName'), false);
});

test('自由文や概要内の報告・会社から氏名や会社を推測しない', () => {
  for (const source of [
    '報告 試験担当が担当した訪問について相談した。',
    '報告 試験担当が担当した訪問。部署名 営業部。案件種別 講習。',
    '相談内容は報告 試験担当。部署名 営業部会社 架空株式会社。案件種別 請負。'
  ]) {
    const result = parseTranscript(source);
    assert.equal(Object.hasOwn(result.values, 'reporterName'), false, source);
    assert.equal(Object.hasOwn(result.values, 'orgName'), false, source);
  }
});

test('後続の正式見出しが不足する報告は氏名を決めない', () => {
  for (const source of ['報告 試験担当。', '報告 試験担当。部署名 営業部。'])
    assert.equal(Object.hasOwn(parseTranscript(source).values, 'reporterName'), false);
});

test('会社名の内部にある会社や他の見出しは切らない', () => {
  const result = parseTranscript('報告者 試験担当。会社名 架空会社希望時期なし株式会社。案件種別 講習。');
  assert.equal(result.values.orgName, '架空会社希望時期なし株式会社');
  assert.equal(Object.hasOwn(result.values, 'desiredTime'), false);
});

test('想定される項目名の誤認識・省略は構造化口述に限り補正する', () => {
  const result = parseTranscript('報告 試験担当。部署 営業部。企業名 架空株式会社。案件種類 請負。発生経路 紹介。紹介者名 試験紹介者。紹介者の関係 取引先。希望日時 9月。緊急度 高め。');
  for (const [key, value] of Object.entries({reporterName:'試験担当',reporterDepartment:'営業部',orgName:'架空株式会社',caseKind:'請負',referrerRelationship:'取引先',desiredTime:'9月',urgency:'高'}))
    assert.equal(result.values[key], value, key);
  for (const alias of ['志望時期', '希望期間'])
    assert.equal(parseTranscript(`報告者 試験担当。会社名 架空株式会社。${alias} 9月。`).values.desiredTime, '9月');
});

test('死亡時期を会社名や自由記述内から希望時期へ切り出さない', () => {
  const company = parseTranscript('報告者は試験担当。会社名。死亡時期株式会社。緊急度は通常。');
  assert.equal(company.values.orgName, '死亡時期株式会社');
  assert.equal(Object.hasOwn(company.values, 'desiredTime'), false);
  const body = '事故を相談された。死亡時期は9月とのこと';
  const result = parseTranscript(`相談内容は${body}。`);
  assert.equal(result.values.summary, body);
  assert.equal(Object.hasOwn(result.values, 'desiredTime'), false);
  assert.equal(Object.hasOwn(parseTranscript('死亡時期 9月。').values, 'desiredTime'), false, '項目を特定できない単独の口述から推測しない');
  for (const name of ['死亡時期 研究株式会社', '希望日時 研究株式会社']) {
    const spacedCompany = parseTranscript(`報告者 試験担当。会社名。${name}。緊急度 通常。`);
    assert.equal(spacedCompany.values.orgName, name);
    assert.equal(Object.hasOwn(spacedCompany.values, 'desiredTime'), false);
  }
});

test('氏名・会社名・金額の文字は項目名補正で書き換えない', () => {
  const result = parseTranscript('報告 名取太郎。部署名 営業部。会社 架空株式会社。案件種別 請負。想定予算 300万円。死亡時期 9月。');
  assert.equal(result.values.reporterName, '名取太郎');
  assert.equal(result.values.orgName, '架空株式会社');
  assert.equal(result.values.budget, '300万円');
});

test('先頭の一般的な言いよどみで全項目の反映を止めない', () => {
  for (const filler of ['えーっと', 'ええと', 'あのー', 'ええと あのー', 'えーっと ええと あのー']) {
    for (const separator of ['。', ' ']) {
      const result = parseTranscript(filler + separator + transcript);
      assert.equal(result.values.reporterName, '試験担当');
      assert.equal(result.values.orgName, '架空 建設会社');
      assert.equal(result.values.desiredTime, '9月');
      assert.equal(result.values.urgency, '高');
    }
  }
});

test('氏名内のひらがなを壊さず、面談等の文章を氏名にしない', () => {
  for (const name of ['おがわ太郎', 'かがみ']) {
    const result = parseTranscript(`報告 ${name}。部署名 営業部。会社名 架空株式会社。案件種別 請負。`);
    assert.equal(result.values.reporterName, name);
    assert.equal(result.values.orgName, '架空株式会社');
  }
  for (const sentence of ['試験担当と面談', '試験担当が取りまとめる資料を見た'])
    assert.equal(Object.hasOwn(parseTranscript(`報告 ${sentence}。部署名 営業部。会社名 架空株式会社。案件種別 請負。`).values, 'reporterName'), false);
});

test('補正見出しでも否定や複数の選択値を勝手に確定しない', () => {
  for (const value of ['請負か講習', '請負ではない'])
    assert.equal(Object.hasOwn(parseTranscript(`報告者 試験担当。会社名 架空株式会社。案件種類 ${value}。`).values, 'caseKind'), false);
});

test('実際の反映ボタンの処理で全欄に入力し、原文・手入力を保持する', () => {
  const fs = require('node:fs');
  const path = require('node:path');
  const vm = require('node:vm');
  const parser = require('./form/voice-parser.js');
  const html = fs.readFileSync(path.join(__dirname, 'form', 'index.html'), 'utf8');
  const script = [...html.matchAll(/<script(?:\s[^>]*)?>([\s\S]*?)<\/script>/g)].map(match => match[1]).find(Boolean);
  const ids = ['reportForm', 'voiceStatus', 'voiceStart', 'voiceStop', 'voiceTranscript', 'voiceApply', 'voiceResult', 'clearBtn', ...Object.keys(parser.fieldNames)];
  const elements = Object.fromEntries(ids.map(id => [id, {
    id, tagName: ['caseKind','channel','urgency','budgetStatus'].includes(id) ? 'SELECT' : 'INPUT',
    value: '', textContent: '', maxLength: -1, listeners: {},
    addEventListener(type, handler) { this.listeners[type] = handler; }
  }]));
  elements.reportForm.querySelectorAll = selector => selector === 'input,select,textarea' ? Object.keys(parser.fieldNames).map(id => elements[id]) : [];
  const context = vm.createContext({ document: { getElementById: id => elements[id] }, window: { CdpVoiceParser: parser }, CdpVoiceParser: parser });
  vm.runInContext(script, context);
  elements.voiceTranscript.value = transcript;
  elements.voiceApply.listeners.click();
  for (const [id, value] of Object.entries({reporterName:'試験担当',reporterDepartment:'営業部',orgName:'架空 建設会社',caseKind:'請負',channel:'学校',desiredTime:'9月',urgency:'高'}))
    assert.equal(elements[id].value, value, id);
  assert.equal(elements.voiceTranscript.value, transcript);
  assert.match(elements.voiceResult.textContent, /死亡時期.*希望時期/);
  elements.orgName.value = '手入力した架空会社';
  elements.orgName.listeners.input();
  elements.urgency.value = '至急';
  elements.urgency.listeners.change();
  elements.voiceApply.listeners.click();
  assert.equal(elements.orgName.value, '手入力した架空会社');
  assert.equal(elements.urgency.value, '至急');
  assert.equal(elements.voiceTranscript.value, transcript);
});
