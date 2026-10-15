/* 音声の文字起こしを、明示された項目名だけで振り分ける。通信・保存はしない。 */
(function (root, factory) {
  var api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) root.CdpVoiceParser = api;
})(typeof window !== 'undefined' ? window : globalThis, function () {
  'use strict';

  var fields = [
    { key: 'reporterName', name: '報告者', aliases: ['報告者（氏名）', '報告者(氏名)', '報告者の氏名', '報告者名', '報告者'] },
    { key: 'reporterDepartment', name: '所属部署', aliases: ['所属部署', '部署名'] },
    { key: 'orgName', name: '会社名', aliases: ['案件先会社名(正式名称)', '案件先会社名（正式名称）', '案件先会社名', '案件先会社', '会社名・顧客名', '会社名', '顧客名'] },
    { key: 'caseTitle', name: '案件名', aliases: ['案件名'] },
    { key: 'caseKind', name: '案件種別', aliases: ['案件種別', '種別'], choices: ['講習', '機体販売', '請負業務／測量', '請負業務／点検', '請負業務／防除', '請負業務／調査', '学校', 'イベント', '実証実験', '打ち合わせ・会議', '機体点検・整備', 'その他', '請負', '打ち合わせ', '問い合わせ'] },
    { key: 'discoveredOn', name: '案件を知った日', aliases: ['案件を知った日', '案件発生日'], date: true },
    { key: 'channel', name: '発生経路', aliases: ['発生経路', '経路'], choices: ['問い合わせ', '紹介', '既存顧客', '営業活動', '不明', '受講生', '社員の人脈', '電話問い合わせ', 'HP問い合わせ', 'イベント', '学校', '協会', '自治体', '協力会社', 'その他'] },
    { key: 'referrerName', name: '紹介者名', aliases: ['紹介者名', '紹介者の名前'] },
    { key: 'referrerRelationship', name: '紹介者との関係', aliases: ['紹介者との関係', '紹介者とのつながり'] },
    { key: 'desiredTime', name: '希望時期', aliases: ['実施日・期限', '実施日と期限', '実施日', '期限', '希望時期'] },
    { key: 'urgency', name: '緊急度', aliases: ['緊急度'], choices: ['通常', '高', '至急'] },
    { key: 'contactInfo', name: '先方担当者', aliases: ['先方の担当者', '先方担当者', '相手の担当者'] },
    { key: 'contactPerson', name: '案件先担当者', aliases: ['案件先担当者(役職も分かれば記載)', '案件先担当者（役職も分かれば記載）', '案件先担当者'] },
    { key: 'contactDetails', name: '案件先担当者の連絡先', aliases: ['案件先担当者連絡先(番号・メアド)', '案件先担当者連絡先（番号・メアド）', '案件先担当者の連絡先', '案件先担当者連絡先', '案件先連絡先', '担当者の連絡先', '連絡先(番号・メアド)', '連絡先（番号・メアド）', '連絡先'] },
    { key: 'revenueEstimate', name: '売上げ見込み', aliases: ['売り上げ見込み', '売り上げ見込', '売上げ見込み', '売上見込み', '売上げ見込', '売上見込'] },
    { key: 'budgetStatus', name: '予算の把握状況', aliases: ['先方予算の把握状況', '予算の把握状況', '予算確認状況', '予算状況', '先方予算', '先方の予算'], choices: ['未確認', '不明', '把握している'] },
    { key: 'budget', name: '想定予算', aliases: ['予算に関するメモ', '想定予算額', '想定予算', '予算額', '予算'] },
    { key: 'categories', name: '相談分野', aliases: ['相談分野'], multipleChoices: ['二等', '一等', '限定解除', '更新', '農業講習', 'その他講習', '機体', '部品/周辺機器', 'メンテナンス', '年次点検', '保険', '測量', 'レーザー', '点群/3D', '空撮', '点検', '農業', '鳥獣/熊', '物流', '実証', 'イベント', '講演/説明会', 'その他'] },
    { key: 'conversationTrigger', name: '会話のきっかけ', aliases: ['会話のきっかけ', '相談のきっかけ'], multiline: true },
    { key: 'summary', name: '相談内容', aliases: ['相談内容', '会話の概要', '概要'], multiline: true },
    { key: 'customerObjective', name: '顧客の目的・課題', aliases: ['顧客の目的・課題', 'お客様の目的・課題', '顧客の目的', '顧客の課題'], multiline: true },
    { key: 'customerNeedsReaction', name: '相手の要望・反応', aliases: ['相手の要望・反応', '相手の要望と反応', '相手の要望', '先方の要望', '相手の反応'], multiline: true },
    { key: 'ourResponseProposal', name: 'こちらの返答・提案', aliases: ['こちらの返答・提案', 'こちらの返答と提案', 'こちらの返答', 'こちらの提案'], multiline: true },
    { key: 'reporterNotes', name: '報告者の所感・注意点', aliases: ['備考・共有事項', '備考と共有事項', '共有事項', '備考', '報告者の所感・注意点', '報告者の所感', '注意点'], multiline: true }
  ];
  var aliasEntries = fields.flatMap(function (field) {
    return field.aliases.map(function (alias) { return { alias: alias, field: field }; });
  }).sort(function (a, b) { return b.alias.length - a.alias.length; });
  // 音声認識が見出し内へ入れた空白だけを許容する。値や原文の空白は削除しない。
  function aliasPattern(entry) {
    var parts = ['orgName', 'contactPerson', 'contactInfo', 'contactDetails', 'budgetStatus', 'budget'].includes(entry.field.key) ? Array.from(entry.alias) : [entry.alias];
    return parts.map(function (part) { return part.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'); }).join('[ \\t　]*');
  }

  function entryForLabel(entries, label) {
    var canonical = label.replace(/[ \t　]/g, '');
    return entries.find(function (entry) { return entry.alias === canonical; });
  }

  function isClientBudgetLabel(match) {
    return match.alias === '先方予算' || match.alias === '先方の予算';
  }

  var aliases = aliasEntries.map(aliasPattern);
  var marker = new RegExp('(^|[。！？\\n、,;；])\\s*(' + aliases.join('|') + ')\\s*(?:は|：|:|＝|=|、|,)\\s*', 'g');
  // 項目名と値を空白で区切る発話も、自由文が始まる前だけ扱う。
  var shortKeys = ['reporterName', 'reporterDepartment', 'orgName', 'caseKind'];
  var bareEntries = aliasEntries.filter(function (entry) {
    return ['種別', '経路', '予算', '概要', '注意点'].indexOf(entry.alias) < 0;
  });
  var bareAliases = bareEntries.map(aliasPattern);
  var bareMarker = new RegExp('(^|[。！？\\n、,;； \\t　])\\s*(' + bareAliases.join('|') + ')(?=[ \\t　]*(?:は|：|:|＝|=)|[ \\t　]+)', 'g');
  // 後続の項目は「項目名は値」と明示された場合だけ、句点なしの連続発話から拾う。
  var inlineEntries = aliasEntries.filter(function (entry) { return shortKeys.indexOf(entry.field.key) < 0; });
  var inlineAliases = inlineEntries.map(aliasPattern);
  var inlineMarker = new RegExp('([ \\t　]+)(' + inlineAliases.join('|') + ')[ \\t　]*(?:は|：|:|＝|=)', 'g');
  var choiceEntries = aliasEntries.filter(function (entry) { return entry.field.choices && entry.alias.length >= 3; });
  var choiceAliases = choiceEntries.map(aliasPattern);
  var choiceValues = Array.from(new Set(choiceEntries.flatMap(function (entry) { return entry.field.choices; })))
    .sort(function (a, b) { return b.length - a.length; })
    .map(function (choice) { return choice.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'); });
  var fusedChoiceMarker = new RegExp('(^|[。！？\\n;；])\\s*(' + choiceAliases.join('|') + ')(?=' + choiceValues.join('|') + ')', 'g');

  // 句頭の正式な見出しを使う口述では、音声認識が区切りを省略したり句点へ変えたりする。
  var spokenEntries = bareEntries.concat([
    { alias: '署名', field: fields.find(function (field) { return field.key === 'reporterDepartment'; }), context: 'department' },
    { alias: '部署', field: fields.find(function (field) { return field.key === 'reporterDepartment'; }), context: 'department' },
    { alias: '報告', field: fields.find(function (field) { return field.key === 'reporterName'; }), context: 'reporter' },
    { alias: '編集', field: fields.find(function (field) { return field.key === 'reporterName'; }), context: 'reporterCorrection', correction: true },
    { alias: '会社', field: fields.find(function (field) { return field.key === 'orgName'; }), context: 'company' },
    { alias: '社', field: fields.find(function (field) { return field.key === 'orgName'; }), context: 'companyCorrection', correction: true },
    { alias: '企業名', field: fields.find(function (field) { return field.key === 'orgName'; }), context: 'company' },
    { alias: '関係', field: fields.find(function (field) { return field.key === 'referrerRelationship'; }), context: 'referrer' },
    { alias: '紹介者の関係', field: fields.find(function (field) { return field.key === 'referrerRelationship'; }), context: 'referrer' },
    { alias: '紹介書との関係', field: fields.find(function (field) { return field.key === 'referrerRelationship'; }), context: 'form', correction: true },
    { alias: '担当者', field: fields.find(function (field) { return field.key === 'contactInfo'; }), context: 'form' },
    { alias: '案件先担当', field: fields.find(function (field) { return field.key === 'contactPerson'; }), context: 'clientContact' },
    { alias: '案件先', field: fields.find(function (field) { return field.key === 'orgName'; }), context: 'clientCompany' },
    { alias: '案件', field: fields.find(function (field) { return field.key === 'caseTitle'; }), context: 'caseTitle' },
    // 現行フォームで金額を明示した短縮見出しだけに限定する。実績や文章からの推定には使わない。
    ...['売り上げ', '売上げ', '売上'].map(function (alias) { return { alias: alias, field: fields.find(function (field) { return field.key === 'revenueEstimate'; }), context: 'revenueAmount' }; }),
    { alias: '希望時間', field: fields.find(function (field) { return field.key === 'desiredTime'; }), context: 'form' },
    { alias: '希望日時', field: fields.find(function (field) { return field.key === 'desiredTime'; }), context: 'form' },
    { alias: '希望期間', field: fields.find(function (field) { return field.key === 'desiredTime'; }), context: 'form' },
    { alias: '志望時期', field: fields.find(function (field) { return field.key === 'desiredTime'; }), context: 'form', correction: true },
    { alias: '死亡時期', field: fields.find(function (field) { return field.key === 'desiredTime'; }), context: 'form', correction: true },
    { alias: '案件種類', field: fields.find(function (field) { return field.key === 'caseKind'; }), context: 'form' },
    { alias: '案件の種類', field: fields.find(function (field) { return field.key === 'caseKind'; }), context: 'form' }
  ]).sort(function (a, b) { return b.alias.length - a.alias.length; });
  var spokenAliases = spokenEntries.map(aliasPattern);
  var fillerWords = 'えーっと|えーと|ええと|えっと|えー|ええ|あのー|あの|はい';
  var spokenMarker = new RegExp('(^|[。！？\\n;；])\\s*(?:(?:' + fillerWords + ')[ \\t　]*)*(?:と[ \\t　]*)?(' + spokenAliases.join('|') + ')', 'g');

  function clean(value) {
    return String(value || '').replace(/^[\s、,。！？;；]+|[\s、,。！？;；]+$/g, '').trim();
  }

  function isSpeechFiller(value) {
    var parts = clean(value).split(/[。！？\n、,;；]+/).map(clean).filter(Boolean);
    var words = '(?:' + fillerWords + '|と|以上|以上です)';
    return parts.every(function (part) { return new RegExp('^' + words + '(?:[ \\t　]+' + words + ')*$').test(part); });
  }

  function isCompanyNameValue(source, item, candidates) {
    if (!item.attached && !item.context) return false;
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
      var entry = entryForLabel(spokenEntries, found[2]);
      var end = spokenMarker.lastIndex;
      var separator = source.slice(end).match(/^[ \t　]*(?:(?:は|[：:＝=、,。]+)[ \t　]*)?/)[0];
      var attached = !separator;
      if (attached && (entry.field.multiline || /^(?:が|を|について|とは|の|に|へ|から)/.test(source.slice(end)))) continue;
      candidates.push({ field: entry.field, alias: entry.alias, spacedLabel: found[2] !== entry.alias,
        start: found.index, labelStart: end - found[2].length, valueStart: end + separator.length,
        context: entry.context, attached: attached, uncertain: attached && entry.alias === '報告者名',
        correctedLabel: entry.correction ? entry.alias : '' });
    }
    candidates = candidates.filter(function (item, index, all) {
      return !isCompanyNameValue(source, item, all);
    });
    var firstText = candidates.find(function (item) { return item.field.multiline; });
    var prefix = candidates.filter(function (item) { return !firstText || item.start <= firstText.start; });
    var formal = prefix.filter(function (item) { return !item.context; });
    // 省略・誤認識の見出しが先頭でも、後続に正式な項目が複数あれば構造化口述として扱う。
    if (!prefix.length) return [];
    var atStart = isSpeechFiller(source.slice(0, prefix[0].start));
    var structured = new Set(formal.map(function (item) { return item.field.key; })).size >= 2;
    if (!atStart && !structured) return [];
    return prefix.filter(function (item, index) {
      var shortRevenue = item.context === 'revenueAmount';
      if ((item.attached || item.context) && !structured && !shortRevenue) return false;
      // 不明な前置きから救済するのは正式見出しだけ。曖昧な省略語は推測しない。
      if (item.context && !atStart && !shortRevenue) return false;
      if (shortRevenue) {
        var nextRevenue = prefix[index + 1], previousRevenue = prefix[index - 1];
        // 未記入欄の直後ならその欄の値を奪わず、不定形の前置きからは期限直後だけを救済する。
        if (previousRevenue && !clean(source.slice(previousRevenue.valueStart, item.labelStart))) return false;
        if (!atStart && (!previousRevenue || previousRevenue.field.key !== 'desiredTime')) return false;
        if (/(?:前年|前年度|昨年|昨年度|先月|過去|実績)/.test(source.slice(0, item.labelStart))) return false;
        // 既存の明示金額判定を検証だけに利用し、原文字列も予算・実績の値も変更しない。
        return explicitClientBudgetAmount(clean(source.slice(item.valueStart, nextRevenue ? nextRevenue.start : source.length)));
      }
      if (item.context === 'reporterCorrection') {
        var joined = clean(source.slice(item.valueStart, prefix[index + 1] ? prefix[index + 1].start : source.length));
        var joinedName = joined.match(/^([\p{L}\p{N} \t　・]{1,30})(?:部署名|所属部署)([^。！？\n]{1,30}(?:部|課|室|局|支店|支社|事業所|センター))$/u);
        return index === 0 && joinedName && !/^(?:内容|して|した|する|画面|方法|機能|作業)/.test(joinedName[1]) &&
          !/(?:について|とは|(?:が|を|と|へ|から|まで)(?:担当|訪問|面談|相談|連絡|確認|取りまとめ|提出|報告|打ち合わせ)|(?:します|しました|です|でした)$)/.test(joinedName[1]);
      }
      if (item.context === 'companyCorrection') {
        var beforeCompany = prefix[index - 1], afterCompany = prefix[index + 1];
        var departmentText = beforeCompany && clean(source.slice(beforeCompany.valueStart, item.start));
        var companyText = clean(source.slice(item.valueStart, afterCompany ? afterCompany.start : source.length));
        var departmentPattern = beforeCompany && beforeCompany.field.key === 'reporterName'
          ? /(?:部署名|所属部署)[^。！？\n]{1,30}(?:部|課|室|局|支店|支社|事業所|センター)$/
          : /^[^。！？\n]{1,30}(?:部|課|室|局|支店|支社|事業所|センター)$/;
        var validCompanyContext = beforeCompany && ['reporterName', 'reporterDepartment'].includes(beforeCompany.field.key) &&
          departmentPattern.test(departmentText) && afterCompany && !afterCompany.context &&
          /^[^。！？\n]{1,100}(?:株式会社|有限会社|合同会社|合名会社|合資会社)$/.test(companyText);
        if (validCompanyContext && item.attached) {
          // 「社サンプル…」と「社労士…」は区別不能。実社名の先頭を落とさない。
          item.uncertain = true;
          item.uncertainMessage = '「社」が見出しか会社名の一部か確認してください。会社名は文字起こし欄に残しています。';
        }
        return validCompanyContext;
      }
      if (item.context === 'reporter') {
        var name = clean(source.slice(item.valueStart, prefix[index + 1] ? prefix[index + 1].start : source.length));
        return index === 0 && !item.attached && /^[\p{L}\p{N} \t　・]{1,30}$/u.test(name) &&
          !/(?:について|とは|(?:が|を|と|へ|から|まで)(?:担当|訪問|面談|相談|連絡|確認|取りまとめ|提出|報告|打ち合わせ)|(?:します|しました|です|でした)$)/.test(name);
      }
      if (item.context === 'company') return !item.attached;
      if (item.context === 'caseTitle') {
        var nextCase = prefix[index + 1], previousCase = prefix[index - 1];
        var caseValue = clean(source.slice(item.valueStart, nextCase ? nextCase.start : source.length));
        // 「案件 サンプル」のように見出しが区切られ、後続に別項目がある口述だけを扱う。
        return !item.attached && nextCase && (!previousCase || clean(source.slice(previousCase.valueStart, item.labelStart))) &&
          /^[^。！？\n]{1,120}$/.test(caseValue) && !looksLikeField(caseValue) &&
          !/(?:について|とは|(?:します|しました|です|でした)$)/.test(caseValue);
      }
      if (item.context === 'clientCompany' || item.context === 'clientContact') {
        var previousClient = prefix[index - 1], nextClient = prefix[index + 1];
        var clientValue = clean(source.slice(item.valueStart, nextClient ? nextClient.start : source.length));
        // 現行フォームの順序で口述された省略見出しだけを扱い、文章や会社名内の語は救済しない。
        var allowedPrevious = item.context === 'clientCompany'
          ? ['caseTitle', 'caseKind', 'reporterDepartment']
          : ['orgName', 'contactPerson'];
        return previousClient && allowedPrevious.includes(previousClient.field.key) &&
          /^[^。！？\n]{1,100}$/.test(clientValue) && !looksLikeField(clientValue) &&
          !/(?:について|とは|(?:が|を|と|へ|から|まで)(?:担当|訪問|面談|相談|連絡|確認|取りまとめ|提出|報告|打ち合わせ)|(?:します|しました|です|でした)$)/.test(clientValue);
      }
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
    if (/^(?:今日|本日)$/.test(value)) {
      var today = new Date();
      return today.getFullYear() + '-' + String(today.getMonth() + 1).padStart(2, '0') + '-' + String(today.getDate()).padStart(2, '0');
    }
    var match = String(value).match(/^(\d{4})[年\/-](\d{1,2})[月\/-](\d{1,2})日?$/);
    if (!match) return '';
    var year = Number(match[1]), month = Number(match[2]), day = Number(match[3]);
    var date = new Date(Date.UTC(year, month - 1, day));
    if (date.getUTCFullYear() !== year || date.getUTCMonth() + 1 !== month || date.getUTCDate() !== day) return '';
    return match[1] + '-' + String(month).padStart(2, '0') + '-' + String(day).padStart(2, '0');
  }

  function positiveChoice(value, choices, fieldKey) {
    var normalized = clean(value).replace(/[\s　]/g, '').replace(/(?:でお願いします|を選びます|にします|でした|です)$/, '');
    if (fieldKey === 'urgency' && normalized === '高め') normalized = '高';
    if (fieldKey === 'caseKind') normalized = normalized.replace(/^請負業務(?:／|\/|の)?(測量|点検|防除|調査)$/, '請負業務／$1');
    return choices.indexOf(normalized) >= 0 ? normalized : '';
  }

  function explicitClientBudgetAmount(value) {
    // 「想定」「未確認」「否定」「候補の列挙」は把握済みの根拠にしない。全文が明示金額の場合だけ使う。
    var amount = clean(value).normalize('NFKC');
    return /^(?:約|およそ|概ね)?\s*(?:\d{1,3}(?:,\d{3})+|\d+)(?:\.\d+)?\s*(?:億円|万円|円|億|万)(?:程度|くらい|ほど)?(?:です|でした)?$/.test(amount);
  }

  function protectExpandedLabels(source, candidates) {
    // 「先方 予算は」の内側の「 予算は」を別の想定予算として重複検出しない。
    var expanded = candidates.filter(function (item) { return item.spacedLabel || isClientBudgetLabel(item); });
    candidates = candidates.filter(function (item) {
      return !expanded.some(function (container) {
        return container.start < item.start && container.valueStart >= item.valueStart && item.start < container.valueStart;
      });
    });
    var firstText = candidates.filter(function (item) { return item.field.multiline; })
      .sort(function (a, b) { return a.start - b.start; })[0];
    var companyRanges = candidates.filter(function (item) { return item.field.key === 'orgName'; }).map(function (item) {
      var sentence = source.slice(item.valueStart).split(/[。！？\n]/)[0];
      var corporate = sentence.match(/(?:株式会社|有限会社|合同会社|合名会社|合資会社|法人|組合)/);
      if (!corporate) return null;
      var end = item.valueStart + corporate.index + corporate[0].length;
      if (!clean(sentence.slice(0, corporate.index))) {
        end = item.valueStart + sentence.length;
        var next = candidates.filter(function (other) {
          return !other.spacedLabel && !isClientBudgetLabel(other) && other.start > item.valueStart + corporate[0].length && other.start < end;
        }).sort(function (a, b) { return a.start - b.start; })[0];
        if (next) end = next.start;
      }
      return { start: item.valueStart, end: end };
    }).filter(Boolean);
    return candidates.filter(function (item) {
      if (!item.spacedLabel && !isClientBudgetLabel(item)) return true;
      if (firstText && item.start > firstText.start) return false;
      return !companyRanges.some(function (range) { return item.valueStart > range.start && item.start < range.end; });
    });
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
      reporterName: ['reporterDepartment'], reporterDepartment: ['orgName', 'caseTitle'],
      discoveredOn: 'channel',
      channel: 'referrerName', referrerName: 'referrerRelationship'
    };
    for (var i = 0; i < matches.length; i += 1) {
      var current = matches[i], nextKeys = successors[current.field.key];
      if (!nextKeys) continue;
      if (!Array.isArray(nextKeys)) nextKeys = [nextKeys];
      var boundary = i + 1 < matches.length ? matches[i + 1].start : source.length;
      var segment = source.slice(current.valueStart, boundary);
      if (current.field.key === 'reporterName') {
        // 明示された報告者句の末尾にある現行部署だけを分ける。氏名・社名・原文は正規化しない。
        var reporterSentence = segment.split(/[。！？\n]/)[0];
        var reporterAndDepartment = reporterSentence.match(/^([\p{L}\p{N}・ \t　]{1,30}?)([ \t　]+)(管理部|推進部|技術部|運営部)[ \t　]*$/u);
        if (reporterAndDepartment && clean(reporterAndDepartment[1]) &&
            !/(?:^|[ \t　])(?:管理部|推進部|技術部|運営部)(?=$|[ \t　])/.test(reporterAndDepartment[1]) &&
            !/(?:について|とは|(?:が|を|と|へ|から|まで)(?:担当|訪問|面談|相談|連絡|確認|取りまとめ|提出|報告|打ち合わせ))/.test(reporterAndDepartment[1])) {
          var departmentStart = current.valueStart + reporterAndDepartment[1].length;
          matches.splice(i + 1, 0, {
            field: fields.find(function (field) { return field.key === 'reporterDepartment'; }),
            start: departmentStart, valueStart: departmentStart + reporterAndDepartment[2].length
          });
          continue;
        }
      }
      var nextEntries = aliasEntries.filter(function (entry) { return nextKeys.includes(entry.field.key) && entry.alias.length >= 3; });
      if (current.field.key === 'reporterName') nextEntries.push({
        alias: '部署', field: fields.find(function (field) { return field.key === 'reporterDepartment'; }), abbreviatedDepartment: true
      });
      if (current.field.key === 'reporterDepartment') nextEntries.push({
        alias: '会社', field: fields.find(function (field) { return field.key === 'orgName'; }), abbreviated: true
      });
      var candidates = nextEntries
        .map(function (entry) { return { entry: entry, index: segment.indexOf(entry.alias) }; })
        .filter(function (item) { return item.index > 0; })
        .sort(function (a, b) { return a.index - b.index || b.entry.alias.length - a.entry.alias.length; });
      for (var j = 0; j < candidates.length; j += 1) {
        var candidate = candidates[j], left = clean(segment.slice(0, candidate.index));
        var nextKey = candidate.entry.field.key;
        var after = segment.slice(candidate.index + candidate.entry.alias.length);
        var separator = after.match(/^[ \t　]*(?:は|：|:|＝|=|、|,|[。]+|[ \t　]+)/);
        var right = clean(separator ? after.slice(separator[0].length) : after);
        if (!left || !right) continue;
        if (candidate.entry.abbreviatedDepartment && (!/^[\p{L}\p{N} \t　・]{1,20}$/u.test(left) ||
            !/^[^。！？\n]{1,30}(?:部|課|室|局|支店|支社|事業所|センター)案件名(?=[ \t　は：:＝=、,。])/.test(right))) continue;
        if (nextKey === 'caseTitle' && (!separator || !/^[^。！？\n]{1,30}(?:部|課|室|局|支店|支社|事業所|センター)$/.test(left))) continue;
        if (candidate.entry.abbreviated && (!separator || !/^[^。！？\n]{1,30}(?:部|課|室|局|支店|支社|事業所|センター)$/.test(left))) continue;
        if (current.field.choices && !positiveChoice(left, current.field.choices)) continue;
        if (current.field.date && !normalizeDate(left)) continue;
        if (!separator && (!['reporterDepartment', 'orgName', 'channel'].includes(nextKey) || left.length > 20)) continue;
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
      var entry = entryForLabel(aliasEntries, found[2]);
      var valueStart = marker.lastIndex;
      var matchedText = found[0].trimEnd();
      var commaLabel = /[、,]$/.test(matchedText);
      matches.push({ field: entry.field, alias: entry.alias, spacedLabel: found[2] !== entry.alias,
        start: found.index, valueStart: valueStart, commaLabel: commaLabel });
      // 読点を項目名の後に使い、値を省略して次の項目名を続けた場合も検出する。
      if (commaLabel) marker.lastIndex = valueStart - (found[0].length - matchedText.length) - 1;
    }
    var bareMatches = [];
    bareMarker.lastIndex = 0;
    while ((found = bareMarker.exec(source))) {
      var bareEntry = entryForLabel(bareEntries, found[2]);
      var bareValueStart = bareMarker.lastIndex;
      while (/[ \t　]/.test(source.charAt(bareValueStart))) bareValueStart += 1;
      if (/[は：:＝=]/.test(source.charAt(bareValueStart))) bareValueStart += 1;
      while (/[ \t　]/.test(source.charAt(bareValueStart))) bareValueStart += 1;
      bareMatches.push({ field: bareEntry.field, alias: bareEntry.alias, spacedLabel: found[2] !== bareEntry.alias,
        start: found.index, valueStart: bareValueStart });
    }
    var choiceMatches = [];
    fusedChoiceMarker.lastIndex = 0;
    while ((found = fusedChoiceMarker.exec(source))) {
      var choiceEntry = entryForLabel(choiceEntries, found[2]);
      if (choiceEntry.field.choices.some(function (choice) { return source.slice(fusedChoiceMarker.lastIndex).startsWith(choice); })) {
        choiceMatches.push({ field: choiceEntry.field, alias: choiceEntry.alias, spacedLabel: found[2] !== choiceEntry.alias,
          start: found.index, valueStart: fusedChoiceMarker.lastIndex,
          labelStart: fusedChoiceMarker.lastIndex - found[2].length, attached: true });
      }
    }
    var inlineMatches = [];
    inlineMarker.lastIndex = 0;
    while ((found = inlineMarker.exec(source))) {
      var inlineEntry = entryForLabel(inlineEntries, found[2]);
      var inlineValueStart = inlineMarker.lastIndex;
      while (/[ \t　]/.test(source.charAt(inlineValueStart))) inlineValueStart += 1;
      inlineMatches.push({ field: inlineEntry.field, alias: inlineEntry.alias, spacedLabel: found[2] !== inlineEntry.alias,
        start: found.index, valueStart: inlineValueStart });
    }
    var spoken = spokenMatches(source);
    var allCandidates = matches.concat(inlineMatches, bareMatches, spoken, choiceMatches);
    allCandidates = protectExpandedLabels(source, allCandidates);
    matches = matches.filter(function (item) { return allCandidates.includes(item); });
    inlineMatches = inlineMatches.filter(function (item) { return allCandidates.includes(item); });
    bareMatches = bareMatches.filter(function (item) { return allCandidates.includes(item); });
    spoken = spoken.filter(function (item) { return allCandidates.includes(item); });
    choiceMatches = choiceMatches.filter(function (item) { return allCandidates.includes(item); });
    var firstCandidate = allCandidates.slice().sort(function (a, b) { return a.start - b.start; })[0];
    var startsWithField = firstCandidate && isSpeechFiller(source.slice(0, firstCandidate.start));
    var firstTextCandidate = allCandidates.filter(function (item) { return item.field.multiline; })
      .sort(function (a, b) { return a.start - b.start; })[0];
    var recoverFields = !startsWithField && new Set(allCandidates.filter(function (item) {
      return !item.context && !item.field.multiline && (!firstTextCandidate || item.start < firstTextCandidate.start);
    }).map(function (item) { return item.field.key; })).size >= 2;
    if (startsWithField || recoverFields) {
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
      if (match.field.key === 'caseTitle') {
        // 見出し直後の「ええ。テスト」のような言いよどみだけを除き、タイトル本文は書き換えない。
        var leadingFiller = raw.match(/^[^。！？\n]+[。！？\n]+/);
        while (leadingFiller && isSpeechFiller(leadingFiller[0])) {
          raw = clean(raw.slice(leadingFiller[0].length));
          leadingFiller = raw.match(/^[^。！？\n]+[。！？\n]+/);
        }
      }
      if (match.uncertain) {
        issues.push(match.uncertainMessage || match.field.name + 'の項目名と氏名の境目を確認してください。');
        leftovers.push(clean(source.slice(match.start, index + 1 < matches.length ? matches[index + 1].start : source.length)));
        return;
      }
      if (isClientBudgetLabel(match) || ['contactInfo', 'budget'].includes(match.field.key)) {
        var lastSentence = raw.match(/([。！？\n]+)([^。！？\n]+)$/);
        if (lastSentence && isSpeechFiller(lastSentence[2])) raw = clean(raw.slice(0, lastSentence.index));
      }
      if (!isClientBudgetLabel(match) && !match.field.multiline && !['contactInfo', 'budget'].includes(match.field.key)) {
        var sentenceEnd = raw.search(/[。！？\n]/);
        if (sentenceEnd >= 0) {
          if (!isSpeechFiller(raw.slice(sentenceEnd + 1))) leftovers.push(clean(raw.slice(sentenceEnd + 1)));
          raw = clean(raw.slice(0, sentenceEnd));
        }
      }
      if (recoverFields && ['reporterName', 'orgName', 'referrerName'].includes(match.field.key) &&
          /(?:と(?:言われた|聞いた|話した|書いた|書かれた)|(?:について|とは)|(?:します|しました|です|でした)$)/.test(raw)) {
        issues.push(match.field.name + 'を文章から特定できませんでした。文字起こしを確認してください。');
        leftovers.push(clean(source.slice(match.start, index + 1 < matches.length ? matches[index + 1].start : source.length)));
        return;
      }
      if (!raw || blocked.has(match.field.key)) return;
      if (match.field.choices) {
        var chosen = positiveChoice(raw, match.field.choices, match.field.key);
        if (!chosen && isClientBudgetLabel(match) && explicitClientBudgetAmount(raw)) chosen = '把握している';
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
        if (match.correctedLabel) issues.push('「' + match.correctedLabel + '」を「' + match.field.name + '」として扱いました。確認してください。');
      }
    });

    var unassigned = leftovers.filter(Boolean).join('。');
    var structuredSpeech = recoverFields || matches.some(function (item) { return item.correctedLabel; }) ||
      new Set(matches.filter(function (item) { return !item.field.multiline; }).map(function (item) { return item.field.key; })).size >= 2;
    if (unassigned && !structuredSpeech && !looksLikeField(unassigned) && !values.summary && !blocked.has('summary')) {
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
