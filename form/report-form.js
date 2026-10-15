/* 公開報告フォームの入力契約。通信・保存・金額の推定は行わない。 */
(function (root, factory) {
  var api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) root.CdpReportForm = api;
})(typeof window !== 'undefined' ? window : globalThis, function () {
  'use strict';
  var fields = [
    { key: 'reporterName', label: '報告者(氏名)', choices: ['小田','横山','斉藤','高木','渋谷','その他'], other: { choice: 'その他', key: 'reporterNameOther', maxLength: 120 } },
    { key: 'reporterDepartment', label: '部署名', choices: ['管理部','推進部','技術部','運営部'] },
    { key: 'caseTitle', label: '案件名', maxLength: 120 },
    { key: 'caseKind', label: '案件種別', choices: ['講習','機体販売','請負業務／測量','請負業務／点検','請負業務／防除','請負業務／調査','学校','イベント','実証実験','打ち合わせ・会議','機体点検・整備','その他'] },
    { key: 'orgName', label: '案件先会社名(正式名称)', maxLength: 120 },
    { key: 'contactPerson', label: '案件先担当者(役職も分かれば記載)', maxLength: 200 },
    { key: 'contactDetails', label: '案件先担当者　連絡先(番号・メアド)', maxLength: 200 },
    { key: 'desiredTime', label: '実施日・期限', maxLength: 60 },
    { key: 'revenueEstimate', label: '売上げ見込み', maxLength: 200 },
    { key: 'reporterNotes', label: '備考・共有事項', maxLength: 2000, optional: true }
  ];
  function validate(input) {
    var values = {}, errors = {};
    fields.forEach(function (field) {
      var raw = input && input[field.key];
      var value = typeof raw === 'string' ? raw.trim() : '';
      values[field.key] = value;
      if (field.other && value === field.other.choice) {
        var otherRaw = input && input[field.other.key];
        value = typeof otherRaw === 'string' ? otherRaw.trim() : '';
        values[field.key] = value;
        if (!value || value === field.other.choice) errors[field.key] = 'その他の報告者氏名を入力してください。';
        else if (value.length > field.other.maxLength) errors[field.key] = '報告者氏名は' + field.other.maxLength + '文字以内で入力してください。';
        return;
      }
      if (!value && !field.optional) errors[field.key] = field.label + (field.choices ? 'を選択してください。' : 'を入力してください。');
      else if (value && field.choices && field.choices.indexOf(value) < 0) errors[field.key] = field.label + 'は表示された選択肢から選んでください。';
      else if (field.maxLength && value.length > field.maxLength) errors[field.key] = field.label + 'は' + field.maxLength + '文字以内で入力してください。';
    });
    return { values: values, errors: errors, valid: Object.keys(errors).length === 0 };
  }
  return { schema: 'minimal-report-20261015', fields: fields, validate: validate };
});
