/* 音声の文字起こしを、明示された項目名だけで振り分ける。通信・保存はしない。 */
(function (root, factory) {
  var api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) root.CdpVoiceParser = api;
})(typeof window !== 'undefined' ? window : globalThis, function () {
  'use strict';

  var fields = [
    { key: 'reporterName', name: '報告者', aliases: ['報告者（氏名）', '報告者の氏名', '報告者名', '報告者'] },
    { key: 'reporterDepartment', name: '所属部署', aliases: ['所属部署', '部署名'] },
    { key: 'orgName', name: '会社名', aliases: ['会社名・顧客名', '会社名', '顧客名'] },
    { key: 'caseKind', name: '案件種別', aliases: ['案件種別', '種別'], choices: ['講習', '請負', '打ち合わせ', '問い合わせ', 'その他'] },
    { key: 'discoveredOn', name: '案件を知った日', aliases: ['案件を知った日', '案件発生日'], date: true },
    { key: 'channel', name: '発生経路', aliases: ['発生経路', '経路'], choices: ['問い合わせ', '紹介', '既存顧客', '営業活動', '不明', '受講生', '社員の人脈', '電話問い合わせ', 'HP問い合わせ', 'イベント', '学校', '協会', '自治体', '協力会社', 'その他'] },
    { key: 'referrerName', name: '紹介者名', aliases: ['紹介者名', '紹介者の名前'] },
    { key: 'referrerRelationship', name: '紹介者との関係', aliases: ['紹介者との関係', '紹介者とのつながり'] },
    { key: 'desiredTime', name: '希望時期', aliases: ['希望時期'] },
    { key: 'urgency', name: '緊急度', aliases: ['緊急度'], choices: ['通常', '高', '至急'] },
    { key: 'contactInfo', name: '先方担当者', aliases: ['先方の担当者', '先方担当者', '相手の担当者'] },
    { key: 'budgetStatus', name: '予算の把握状況', aliases: ['先方予算の把握状況', '予算の把握状況', '予算確認状況', '予算状況'], choices: ['未確認', '不明', '把握している'] },
    { key: 'budget', name: '想定予算', aliases: ['予算に関するメモ', '想定予算額', '想定予算', '予算額', '予算'] },
    { key: 'categories', name: '相談分野', aliases: ['相談分野'], multipleChoices: ['二等', '一等', '限定解除', '更新', '農業講習', 'その他講習', '機体', '部品/周辺機器', 'メンテナンス', '年次点検', '保険', '測量', 'レーザー', '点群/3D', '空撮', '点検', '農業', '鳥獣/熊', '物流', '実証', 'イベント', '講演/説明会', 'その他'] },
    { key: 'conversationTrigger', name: '会話のきっかけ', aliases: ['会話のきっかけ', '相談のきっかけ'], multiline: true },
    { key: 'summary', name: '相談内容', aliases: ['相談内容', '会話の概要', '概要'], multiline: true },
    { key: 'customerObjective', name: '顧客の目的・課題', aliases: ['顧客の目的・課題', 'お客様の目的・課題', '顧客の目的', '顧客の課題'], multiline: true },
    { key: 'customerNeedsReaction', name: '相手の要望・反応', aliases: ['相手の要望・反応', '相手の要望と反応', '相手の要望', '先方の要望', '相手の反応'], multiline: true },
    { key: 'ourResponseProposal', name: 'こちらの返答・提案', aliases: ['こちらの返答・提案', 'こちらの返答と提案', 'こちらの返答', 'こちらの提案'], multiline: true },
    { key: 'reporterNotes', name: '報告者の所感・注意点', aliases: ['報告者の所感・注意点', '報告者の所感', '注意点'], multiline: true }
  ];
  var aliasEntries = fields.flatMap(function (field) {
    return field.aliases.map(function (alias) { return { alias: alias, field: field }; });
  }).sort(function (a, b) { return b.alias.length - a.alias.length; });
  var aliases = aliasEntries.map(function (entry) { return entry.alias.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'); });
  var marker = new RegExp('(^|[。！？\\n、,;；])\\s*(' + aliases.join('|') + ')\\s*(?:は|：|:|＝|=)\\s*', 'g');
  // 句点なしで続けて話す形式は受付冒頭の4項目に限定する。自由文内の項目名は拾わない。
  var shortKeys = ['reporterName', 'reporterDepartment', 'orgName', 'caseKind'];
  var shortEntries = aliasEntries.filter(function (entry) {
    return shortKeys.indexOf(entry.field.key) >= 0 && entry.alias !== '種別';
  });
  var shortAliases = shortEntries.map(function (entry) { return entry.alias.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'); });
  var shortMarker = new RegExp('(^|[。！？\\n、,;； \\t　])\\s*(' + shortAliases.join('|') + ')(?=[ \\t　]*(?:は|：|:|＝|=)|[ \\t　]+)', 'g');
  // 後続の項目は「項目名は値」と明示された場合だけ、句点なしの連続発話から拾う。
  var inlineEntries = aliasEntries.filter(function (entry) { return shortKeys.indexOf(entry.field.key) < 0; });
  var inlineAliases = inlineEntries.map(function (entry) { return entry.alias.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'); });
  var inlineMarker = new RegExp('([ \\t　]+)(' + inlineAliases.join('|') + ')[ \\t　]*(?:は|：|:|＝|=)', 'g');

  function clean(value) {
    return String(value || '').replace(/^[\s、,。！？;；]+|[\s、,。！？;；]+$/g, '').trim();
  }

  function normalizeDate(value) {
    var match = String(value).match(/^(\d{4})[年\/-](\d{1,2})[月\/-](\d{1,2})日?$/);
    if (!match) return '';
    var year = Number(match[1]), month = Number(match[2]), day = Number(match[3]);
    var date = new Date(Date.UTC(year, month - 1, day));
    if (date.getUTCFullYear() !== year || date.getUTCMonth() + 1 !== month || date.getUTCDate() !== day) return '';
    return match[1] + '-' + String(month).padStart(2, '0') + '-' + String(day).padStart(2, '0');
  }

  function positiveChoice(value, choices) {
    var normalized = clean(value).replace(/[\s　]/g, '').replace(/(?:でお願いします|を選びます|にします|でした|です)$/, '');
    return choices.indexOf(normalized) >= 0 ? normalized : '';
  }

  function categoryChoices(value, choices) {
    var tokens = clean(value).replace(/(?:でした|です)$/, '')
      .split(/\s*(?:、|,|・|および|及び|と)\s*/).map(clean).filter(Boolean);
    if (!tokens.length || tokens.some(function (token) { return choices.indexOf(token) < 0; })) return null;
    return Array.from(new Set(tokens));
  }

  function parseTranscript(transcript) {
    var source = String(transcript || '').trim();
    var values = {}, issues = [], leftovers = [], blocked = new Set(), matches = [], found;
    marker.lastIndex = 0;
    while ((found = marker.exec(source))) {
      var entry = aliasEntries.find(function (item) { return item.alias === found[2]; });
      matches.push({ field: entry.field, start: found.index, valueStart: marker.lastIndex });
    }
    var bareMatches = [];
    shortMarker.lastIndex = 0;
    while ((found = shortMarker.exec(source))) {
      var shortEntry = shortEntries.find(function (item) { return item.alias === found[2]; });
      var shortValueStart = shortMarker.lastIndex;
      while (/[ \t　]/.test(source.charAt(shortValueStart))) shortValueStart += 1;
      if (/[は：:＝=]/.test(source.charAt(shortValueStart))) shortValueStart += 1;
      while (/[ \t　]/.test(source.charAt(shortValueStart))) shortValueStart += 1;
      bareMatches.push({ field: shortEntry.field, start: found.index, valueStart: shortValueStart });
    }
    var inlineMatches = [];
    inlineMarker.lastIndex = 0;
    while ((found = inlineMarker.exec(source))) {
      var inlineEntry = inlineEntries.find(function (item) { return item.alias === found[2]; });
      var inlineValueStart = inlineMarker.lastIndex;
      while (/[ \t　]/.test(source.charAt(inlineValueStart))) inlineValueStart += 1;
      inlineMatches.push({ field: inlineEntry.field, start: found.index, valueStart: inlineValueStart });
    }
    var startsWithField = (bareMatches.length && bareMatches[0].start === 0) ||
      (matches.length && matches[0].start === 0);
    if (startsWithField) {
      var explicitMatches = matches.slice();
      var firstFreeText = matches.concat(inlineMatches).filter(function (item) { return item.field.multiline; })
        .sort(function (a, b) { return a.start - b.start; })[0];
      inlineMatches.forEach(function (item) {
        if (firstFreeText && item.start > firstFreeText.start) return;
        if (explicitMatches.some(function (existing) {
          return item.start < existing.valueStart && item.valueStart > existing.start;
        })) return;
        matches.push(item);
      });
      bareMatches.forEach(function (item) {
        if (firstFreeText && item.start >= firstFreeText.start) return;
        if (explicitMatches.some(function (existing) {
          return item.start < existing.valueStart && item.valueStart > existing.start;
        })) return;
        matches.push(item);
      });
      matches.sort(function (a, b) { return a.start - b.start; });
    }
    if (!matches.length) return { values: source ? { summary: clean(source) } : {}, issues: [], unassigned: '' };
    if (clean(source.slice(0, matches[0].start))) leftovers.push(clean(source.slice(0, matches[0].start)));

    matches.forEach(function (match, index) {
      var raw = clean(source.slice(match.valueStart, index + 1 < matches.length ? matches[index + 1].start : source.length));
      if (!match.field.multiline) {
        var sentenceEnd = raw.search(/[。！？\n]/);
        if (sentenceEnd >= 0) {
          if (clean(raw.slice(sentenceEnd + 1))) leftovers.push(clean(raw.slice(sentenceEnd + 1)));
          raw = clean(raw.slice(0, sentenceEnd));
        }
      }
      if (!raw || blocked.has(match.field.key)) return;
      if (match.field.choices) {
        var chosen = positiveChoice(raw, match.field.choices);
        if (!chosen) {
          issues.push(match.field.name + 'は選択肢を一つに決められませんでした。');
          return;
        }
        raw = chosen;
      }
      if (match.field.multipleChoices) {
        var selected = categoryChoices(raw, match.field.multipleChoices);
        if (!selected) {
          issues.push(match.field.name + 'は選択肢を確認して手入力してください。');
          return;
        }
        raw = selected;
      }
      if (match.field.date) {
        var normalized = normalizeDate(raw);
        if (!normalized) {
          issues.push(match.field.name + 'は年・月・日を確認して手入力してください。');
          return;
        }
        raw = normalized;
      }
      var previous = values[match.field.key];
      var same = Array.isArray(previous) && Array.isArray(raw)
        ? previous.length === raw.length && previous.every(function (item) { return raw.indexOf(item) >= 0; })
        : previous === raw;
      if (Object.prototype.hasOwnProperty.call(values, match.field.key) && !same) {
        delete values[match.field.key];
        blocked.add(match.field.key);
        issues.push(match.field.name + 'が複数あるため、手入力で確認してください。');
      } else {
        values[match.field.key] = raw;
      }
    });

    var unassigned = leftovers.filter(Boolean).join('。');
    if (unassigned && !values.summary && !blocked.has('summary')) {
      values.summary = unassigned;
      unassigned = '';
    }
    return { values: values, issues: issues, unassigned: unassigned };
  }

  function updateDecision(state, value) {
    if (state.manuallyChanged || (state.existing && !state.voiceFilled)) return 'preserve';
    if (state.maxLength > 0 && value.length > state.maxLength) return 'too-long';
    return 'fill';
  }

  return { parseTranscript: parseTranscript, updateDecision: updateDecision,
    fieldNames: Object.fromEntries(fields.map(function (field) { return [field.key, field.name]; })) };
});
