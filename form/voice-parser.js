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
  var marker = new RegExp('(^|[。！？\\n、,;；])\\s*(' + aliases.join('|') + ')\\s*(?:は|：|:|＝|=|、|,)\\s*', 'g');
  // 項目名と値を空白で区切る発話も、自由文が始まる前だけ扱う。
  var shortKeys = ['reporterName', 'reporterDepartment', 'orgName', 'caseKind'];
  var bareEntries = aliasEntries.filter(function (entry) {
    return ['種別', '経路', '予算', '概要', '注意点'].indexOf(entry.alias) < 0;
  });
  var bareAliases = bareEntries.map(function (entry) { return entry.alias.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'); });
  var bareMarker = new RegExp('(^|[。！？\\n、,;； \\t　])\\s*(' + bareAliases.join('|') + ')(?=[ \\t　]*(?:は|：|:|＝|=)|[ \\t　]+)', 'g');
  // 後続の項目は「項目名は値」と明示された場合だけ、句点なしの連続発話から拾う。
  var inlineEntries = aliasEntries.filter(function (entry) { return shortKeys.indexOf(entry.field.key) < 0; });
  var inlineAliases = inlineEntries.map(function (entry) { return entry.alias.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'); });
  var inlineMarker = new RegExp('([ \\t　]+)(' + inlineAliases.join('|') + ')[ \\t　]*(?:は|：|:|＝|=)', 'g');
  var choiceEntries = aliasEntries.filter(function (entry) { return entry.field.choices && entry.alias.length >= 3; });
  var choiceAliases = choiceEntries.map(function (entry) { return entry.alias.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'); });
  var choiceValues = Array.from(new Set(choiceEntries.flatMap(function (entry) { return entry.field.choices; })))
    .sort(function (a, b) { return b.length - a.length; })
    .map(function (choice) { return choice.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'); });
  var fusedChoiceMarker = new RegExp('(^|[。！？\\n;；])\\s*(' + choiceAliases.join('|') + ')(?=' + choiceValues.join('|') + ')', 'g');

  // 句頭の正式な見出しを使う口述では、音声認識が区切りを省略したり句点へ変えたりする。
  var spokenEntries = bareEntries.concat([
    { alias: '署名', field: fields.find(function (field) { return field.key === 'reporterDepartment'; }), context: 'department' },
    { alias: '関係', field: fields.find(function (field) { return field.key === 'referrerRelationship'; }), context: 'referrer' },
    { alias: '担当者', field: fields.find(function (field) { return field.key === 'contactInfo'; }), context: 'form' },
    { alias: '希望時間', field: fields.find(function (field) { return field.key === 'desiredTime'; }), context: 'form' }
  ]).sort(function (a, b) { return b.alias.length - a.alias.length; });
  var spokenAliases = spokenEntries.map(function (entry) { return entry.alias.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'); });
  var spokenMarker = new RegExp('(^|[。！？\\n;；])\\s*(?:と[ \\t　]*)?(' + spokenAliases.join('|') + ')', 'g');

  function clean(value) {
    return String(value || '').replace(/^[\s、,。！？;；]+|[\s、,。！？;；]+$/g, '').trim();
  }

  function isSpeechFiller(value) {
    var parts = clean(value).split(/[。！？\n、,;；]+/).map(clean).filter(Boolean);
    return parts.every(function (part) { return /^(?:ええ|えーと|えっと|えー|あの|はい|と|以上|以上です)$/.test(part); });
  }

  function isCompanyNameValue(source, item, candidates) {
    if (!item.attached) return false;
    var previous = candidates.filter(function (candidate) { return candidate.start < item.start; })
      .sort(function (a, b) { return b.start - a.start; })[0];
    if (!previous || previous.field.key !== 'orgName' || clean(source.slice(previous.valueStart, item.labelStart))) return false;
    var company = source.slice(item.labelStart).split(/[。！？\n]/)[0];
    return /(?:株式会社|有限会社|合同会社|合名会社|合資会社|法人|組合)/.test(company);
  }

  function spokenMatches(source) {
    var candidates = [], found;
    spokenMarker.lastIndex = 0;
    while ((found = spokenMarker.exec(source))) {
      var entry = spokenEntries.find(function (item) { return item.alias === found[2]; });
      var end = spokenMarker.lastIndex;
      var separator = source.slice(end).match(/^[ \t　]*(?:(?:は|[：:＝=、,。]+)[ \t　]*)?/)[0];
      var attached = !separator;
      if (attached && (entry.field.multiline || /^(?:が|を|について|とは|の|に|へ|から)/.test(source.slice(end)))) continue;
      candidates.push({ field: entry.field, start: found.index, labelStart: end - entry.alias.length, valueStart: end + separator.length,
        context: entry.context, attached: attached, uncertain: attached && entry.alias === '報告者名' });
    }
    candidates = candidates.filter(function (item, index, all) {
      return !isCompanyNameValue(source, item, all);
    });
    var firstText = candidates.find(function (item) { return item.field.multiline; });
    var prefix = candidates.filter(function (item) { return !firstText || item.start <= firstText.start; });
    var formal = prefix.filter(function (item) { return !item.context; });
    if (!formal.length || !isSpeechFiller(source.slice(0, formal[0].start))) return [];
    var structured = new Set(formal.map(function (item) { return item.field.key; })).size >= 2;
    return prefix.filter(function (item, index) {
      if ((item.attached || item.context) && !structured) return false;
      if (item.context === 'department') {
        var previous = prefix[index - 1], next = prefix[index + 1];
        var department = clean(source.slice(item.valueStart, next ? next.start : source.length));
        return previous && previous.field.key === 'reporterName' && next && next.field.key === 'orgName' &&
          /^[^。！？\n]{1,30}(?:部|課|室|局|支店|支社|事業所|センター)$/.test(department);
      }
      if (item.context === 'referrer') return index > 0 && prefix[index - 1].field.key === 'referrerName';
      return true;
    });
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

  // 音声認識が「山田部署名営業部」のように境目を落とした場合も、
  // 冒頭の定型項目と選択肢の明確な並びだけを分ける。
  function splitFusedLabels(source, matches) {
    var successors = {
      reporterName: 'reporterDepartment', reporterDepartment: 'orgName',
      channel: 'referrerName', referrerName: 'referrerRelationship'
    };
    for (var i = 0; i < matches.length; i += 1) {
      var current = matches[i], nextKey = successors[current.field.key];
      if (!nextKey) continue;
      var boundary = i + 1 < matches.length ? matches[i + 1].start : source.length;
      var segment = source.slice(current.valueStart, boundary);
      var candidates = aliasEntries.filter(function (entry) { return entry.field.key === nextKey && entry.alias.length >= 3; })
        .map(function (entry) { return { entry: entry, index: segment.indexOf(entry.alias) }; })
        .filter(function (item) { return item.index > 0; })
        .sort(function (a, b) { return a.index - b.index || b.entry.alias.length - a.entry.alias.length; });
      for (var j = 0; j < candidates.length; j += 1) {
        var candidate = candidates[j], left = clean(segment.slice(0, candidate.index));
        var after = segment.slice(candidate.index + candidate.entry.alias.length);
        var separator = after.match(/^[ \t　]*(?:は|：|:|＝|=|、|,|[ \t　]+)/);
        var right = clean(separator ? after.slice(separator[0].length) : after);
        if (!left || !right) continue;
        if (current.field.choices && !positiveChoice(left, current.field.choices)) continue;
        if (!separator && (!['reporterDepartment', 'orgName'].includes(nextKey) || left.length > 20)) continue;
        var start = current.valueStart + candidate.index;
        matches.splice(i + 1, 0, {
          field: candidate.entry.field, start: start,
          valueStart: start + candidate.entry.alias.length + (separator ? separator[0].length : 0)
        });
        break;
      }
    }
  }

  function looksLikeField(value) {
    return /(?:^|[。！？\n])\s*(?:報告者|所属部署|部署名|会社名|顧客名|案件種別|案件[、,]\s*未分類|(?:講習|請負|打ち合わせ|問い合わせ|その他)?案件を知った日|案件発生日|発生経路|紹介者名|紹介者との関係|希望時期|希望時間|緊急度|先方担当者|予算の把握状況|想定予算|相談内容)/.test(value);
  }

  function parseTranscript(transcript) {
    var source = String(transcript || '').trim();
    var values = {}, issues = [], leftovers = [], blocked = new Set(), matches = [], found;
    marker.lastIndex = 0;
    while ((found = marker.exec(source))) {
      var entry = aliasEntries.find(function (item) { return item.alias === found[2]; });
      var valueStart = marker.lastIndex;
      var matchedText = found[0].trimEnd();
      var commaLabel = /[、,]$/.test(matchedText);
      matches.push({ field: entry.field, start: found.index, valueStart: valueStart, commaLabel: commaLabel });
      // 読点を項目名の後に使い、値を省略して次の項目名を続けた場合も検出する。
      if (commaLabel) marker.lastIndex = valueStart - (found[0].length - matchedText.length) - 1;
    }
    var bareMatches = [];
    bareMarker.lastIndex = 0;
    while ((found = bareMarker.exec(source))) {
      var bareEntry = bareEntries.find(function (item) { return item.alias === found[2]; });
      var bareValueStart = bareMarker.lastIndex;
      while (/[ \t　]/.test(source.charAt(bareValueStart))) bareValueStart += 1;
      if (/[は：:＝=]/.test(source.charAt(bareValueStart))) bareValueStart += 1;
      while (/[ \t　]/.test(source.charAt(bareValueStart))) bareValueStart += 1;
      bareMatches.push({ field: bareEntry.field, start: found.index, valueStart: bareValueStart });
    }
    var choiceMatches = [];
    fusedChoiceMarker.lastIndex = 0;
    while ((found = fusedChoiceMarker.exec(source))) {
      var choiceEntry = choiceEntries.find(function (item) { return item.alias === found[2]; });
      if (choiceEntry.field.choices.some(function (choice) { return source.slice(fusedChoiceMarker.lastIndex).startsWith(choice); })) {
        choiceMatches.push({ field: choiceEntry.field, start: found.index, valueStart: fusedChoiceMarker.lastIndex,
          labelStart: fusedChoiceMarker.lastIndex - choiceEntry.alias.length, attached: true });
      }
    }
    var inlineMatches = [];
    inlineMarker.lastIndex = 0;
    while ((found = inlineMarker.exec(source))) {
      var inlineEntry = inlineEntries.find(function (item) { return item.alias === found[2]; });
      var inlineValueStart = inlineMarker.lastIndex;
      while (/[ \t　]/.test(source.charAt(inlineValueStart))) inlineValueStart += 1;
      inlineMatches.push({ field: inlineEntry.field, start: found.index, valueStart: inlineValueStart });
    }
    var spoken = spokenMatches(source);
    var allCandidates = matches.concat(inlineMatches, bareMatches, spoken);
    var firstCandidate = allCandidates.slice().sort(function (a, b) { return a.start - b.start; })[0];
    var startsWithField = firstCandidate && isSpeechFiller(source.slice(0, firstCandidate.start));
    if (startsWithField) {
      var firstSpokenFreeText = allCandidates.filter(function (item) { return item.field.multiline; })
        .sort(function (a, b) { return a.start - b.start; })[0];
      spoken.forEach(function (item) {
        if (firstSpokenFreeText && item.start > firstSpokenFreeText.start) return;
        if (matches.some(function (existing) { return item.field.key === existing.field.key && item.start < existing.valueStart && item.valueStart > existing.start; })) return;
        matches.push(item);
      });
      var explicitMatches = matches.slice();
      var firstFreeText = matches.concat(inlineMatches, bareMatches).filter(function (item) { return item.field.multiline; })
        .sort(function (a, b) { return a.start - b.start; })[0];
      choiceMatches.forEach(function (item) {
        if (firstFreeText && item.start >= firstFreeText.start) return;
        if (isCompanyNameValue(source, item, matches)) return;
        if (explicitMatches.some(function (existing) {
          return item.field.key === existing.field.key && item.start < existing.valueStart && item.valueStart > existing.start;
        })) return;
        matches.push(item);
      });
      inlineMatches.forEach(function (item) {
        if (firstFreeText && item.start > firstFreeText.start) return;
        if (explicitMatches.some(function (existing) {
          return item.field.key === existing.field.key && item.start < existing.valueStart && item.valueStart > existing.start;
        })) return;
        matches.push(item);
      });
      bareMatches.forEach(function (item) {
        if (firstFreeText && item.start > firstFreeText.start) return;
        if (explicitMatches.some(function (existing) {
          return item.field.key === existing.field.key && item.start < existing.valueStart && item.valueStart > existing.start;
        })) return;
        matches.push(item);
      });
      // 新たに許容した読点見出しは自由記述の後で抽出しない（既存の「は」見出しは維持）。
      if (firstFreeText) matches = matches.filter(function (item) {
        return item.start <= firstFreeText.start || !item.commaLabel;
      });
      matches.sort(function (a, b) { return a.start - b.start; });
      splitFusedLabels(source, matches);
    }
    if (!matches.length) return source && looksLikeField(source)
      ? { values: {}, issues: ['項目名と値の境目を確認して手入力してください。'], unassigned: source }
      : { values: source ? { summary: clean(source) } : {}, issues: [], unassigned: '' };
    if (!isSpeechFiller(source.slice(0, matches[0].start))) leftovers.push(clean(source.slice(0, matches[0].start)));

    matches.forEach(function (match, index) {
      var raw = clean(source.slice(match.valueStart, index + 1 < matches.length ? matches[index + 1].start : source.length));
      if (match.uncertain) {
        issues.push(match.field.name + 'の項目名と氏名の境目を確認してください。');
        leftovers.push(clean(source.slice(match.start, index + 1 < matches.length ? matches[index + 1].start : source.length)));
        return;
      }
      if (!match.field.multiline) {
        var sentenceEnd = raw.search(/[。！？\n]/);
        if (sentenceEnd >= 0) {
          if (!isSpeechFiller(raw.slice(sentenceEnd + 1))) leftovers.push(clean(raw.slice(sentenceEnd + 1)));
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
    if (unassigned && !looksLikeField(unassigned) && !values.summary && !blocked.has('summary')) {
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
