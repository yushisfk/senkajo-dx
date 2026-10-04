/*
 * sf_shipping_export.js
 * 受注管理（選果場出荷物）: 佐川CSV / ヤマトxlsx 送り状データ出力
 *
 * 依存ライブラリ（kintoneのJSカスタマイズ設定に、このファイルより「上」に登録すること）
 *   1. https://cdn.jsdelivr.net/npm/exceljs@4.4.0/dist/exceljs.min.js
 *   2. https://cdn.jsdelivr.net/npm/encoding-japanese@2.2.0/encoding.min.js
 *   3. sf_yamato_template.js  （テンプレートbase64）
 *   4. sf_shipping_export.js  （このファイル）
 *
 * 出力仕様
 *   佐川 : CP932 / 改行LF / 全項目ダブルクォート囲み / ヘッダー1行 / 12列  → .csv
 *   ヤマト: テンプレートxlsxの2行目以降にデータを書き込み / A〜S列19列      → .xlsx
 *
 * 共通ロジック
 *   ・ビューの絞り込み条件でレコード取得
 *   ・出荷ステータス「キャンセル」「出荷済」を除外
 *   ・出荷先 × 納品日 でグループ化 → 個口数を合計 → 切り上げ（1.5→2）
 *   ・品名は「、」で連結。上限超過時は「先頭商品 他N件」
 *   ・除外・警告があれば確認ポップアップを表示（0件なら即ダウンロード）
 */
(function () {
  'use strict';

  // ==========================================================================
  // 1. 設定
  // ==========================================================================

  /** フィールドコード定義 */
  var F = {
    受注日: '日付',
    出荷先: 'ルックアップ',
    得意先: '文字列__1行_',
    商品名: 'ルックアップ_0',
    受注数量: '数値',
    個口数: '数値_0',
    出荷予定日: '日付_0',
    納品日: '日付_1',
    物流業者: 'ラジオボタン',
    出荷: 'ラジオボタン_0',

    // ---- 佐川使用欄 ----
    住所コード区分: '文字列__1行__6',
    住所録コード: '文字列__1行__8',
    依頼主コード区分: '文字列__1行__7',
    依頼主コード: '文字列__1行__9',
    荷姿コード: '文字列__1行__2',
    品名1: '文字列__1行__1',
    スピード指定: '文字列__1行__3',
    クール便指定: '文字列__1行__4',
    配達時間帯指定: '文字列__1行__5',

    // ---- ヤマト使用欄 ----
    送り状種類: '数値_7',
    配達時間帯: '文字列__1行__21',
    お届け先電話番号: '文字列__1行__14',
    お届け先郵便番号: '数値_2',
    お届け先住所: '文字列__1行__12',
    お届け先会社部門1: '文字列__1行__13',
    お届け先名: '文字列__1行__11',
    敬称: '文字列__1行__18',
    ご依頼主電話番号: '文字列__1行__15',
    ご依頼主郵便番号: '数値_3',
    ご依頼主住所: '文字列__1行__16',
    ご依頼主名: '文字列__1行__17',
    個口数表示フラグ: '数値_8',
    請求先顧客コード: '文字列__1行__19',
    運賃管理番号: '文字列__1行__20'
  };

  /** 出荷ステータスのうち出力から除外するもの */
  var EXCLUDE_STATUS = {
    'キャンセル': 'キャンセル',
    '出荷済': '出荷済（送り状の二重発行防止）'
  };

  /** ボタンを設置するビューID */
  var VIEWS = {
    6383856: { carrier: 'sagawa', label: '佐川CSV出力（当日分）' },
    6383876: { carrier: 'sagawa', label: '佐川CSV出力（翌日分）' },
    6384599: { carrier: 'yamato', label: 'ヤマトCSV出力（当日分）' },
    6384610: { carrier: 'yamato', label: 'ヤマトCSV出力（翌日分）' }
  };

  /** 品名の上限（半角換算。全角25文字＝半角50文字） */
  var ITEM_NAME_MAX_WIDTH = 50;

  /** 品名の連結区切り文字 */
  var ITEM_NAME_SEPARATOR = '、';

  /** 佐川CSVのヘッダー（kintone純正エクスポートと完全一致させること） */
  var SAGAWA_HEADER = [
    '出荷先',
    '住所コード区分',
    '住所録コード',
    '依頼主コード区分',
    '依頼主コード',
    '荷姿コード',
    '品名１（佐川ヤマト共用）',
    '個口数(発行枚数）',
    'スピード指定',
    'クール便指定',
    '納品日',
    '配達時間帯指定'
  ];

  /** ヤマトxlsx: 文字列（@）書式にする列番号（1始まり） */
  var YAMATO_TEXT_COLUMNS = [2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 18, 19];

  var BUTTON_ID = 'sf-shipping-export-btn';
  var MODAL_ID = 'sf-shipping-export-modal';

  // ==========================================================================
  // 2. 汎用ユーティリティ
  // ==========================================================================

  /** レコードのフィールド値を文字列で取得（未定義でも落ちない） */
  function val(record, code) {
    var f = record[code];
    if (!f || f.value === null || f.value === undefined) return '';
    return String(f.value);
  }

  /** 先頭のアポストロフィ（Excelの0落ち対策記号）を除去 */
  function stripQuote(v) {
    return String(v == null ? '' : v).replace(/^'+/, '');
  }

  /** '2026-08-12' → '2026/08/12' （ヤマト仕様の半角10文字を満たす） */
  function toSlashDate(v) {
    if (!v) return '';
    var m = /^(\d{4})-(\d{2})-(\d{2})/.exec(v);
    return m ? m[1] + '/' + m[2] + '/' + m[3] : String(v);
  }

  /** '2026-08-12' → '20260812' （ファイル名用） */
  function toCompactDate(v) {
    if (!v) return '';
    var m = /^(\d{4})-(\d{2})-(\d{2})/.exec(v);
    return m ? m[1] + m[2] + m[3] : String(v).replace(/[^0-9]/g, '');
  }

  /** 郵便番号を7桁ゼロ埋め（数値フィールドの0落ち対策） */
  function padPostal(v) {
    var s = String(v == null ? '' : v).replace(/[^0-9]/g, '');
    if (!s) return '';
    if (s.length >= 7) return s;
    return ('0000000' + s).slice(-7);
  }

  /** 文字列の表示幅（半角=1 / 全角=2） */
  function strWidth(s) {
    var w = 0;
    for (var i = 0; i < s.length; i++) {
      var c = s.charCodeAt(i);
      if ((c >= 0x20 && c <= 0x7e) || (c >= 0xff61 && c <= 0xff9f)) w += 1;
      else w += 2;
    }
    return w;
  }

  /** 指定した表示幅に収まるよう末尾を切り捨てる */
  function truncateByWidth(s, maxWidth) {
    var w = 0;
    var out = '';
    for (var i = 0; i < s.length; i++) {
      var cw = strWidth(s.charAt(i));
      if (w + cw > maxWidth) break;
      out += s.charAt(i);
      w += cw;
    }
    return out;
  }

  /** 数値化（空欄・不正値は0） */
  function toNumber(v) {
    var n = parseFloat(String(v == null ? '' : v).replace(/,/g, ''));
    return isNaN(n) ? 0 : n;
  }

  function escapeHtml(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  }

  // ==========================================================================
  // 3. レコード取得（カーソルAPI）
  // ==========================================================================

  /**
   * 現在のビューの絞り込み条件で全レコードを取得する。
   * kintone.app.getQueryCondition() を使うため、ユーザーが画面上で
   * 追加した絞り込みもそのまま反映される。
   */
  function fetchAllRecords(appId) {
    var cond = kintone.app.getQueryCondition() || '';
    var query = (cond ? cond + ' ' : '') + 'order by レコード番号 asc';

    var all = [];

    return kintone.api(kintone.api.url('/k/v1/records/cursor.json', true), 'POST', {
      app: appId,
      query: query,
      size: 500
    }).then(function (res) {
      var cursorId = res.id;

      function next() {
        return kintone.api(kintone.api.url('/k/v1/records/cursor.json', true), 'GET', {
          id: cursorId
        }).then(function (r) {
          all = all.concat(r.records);
          return r.next ? next() : all;
        });
      }
      return next();
    });
  }

  // ==========================================================================
  // 4. 集計ロジック（除外判定 → グループ化 → 合算・切り上げ）
  // ==========================================================================

  /**
   * @returns {{groups: Array, excluded: Array}}
   *   groups   … マージ後の出力単位。head（代表レコード）/ records / 個口数 / 品名 を持つ
   *   excluded … 出力から除外したレコード（キャンセル・出荷済）
   */
  function buildGroups(records) {
    var excluded = [];
    var map = {};
    var order = [];

    records.forEach(function (r) {
      var status = val(r, F.出荷);

      // ---- 除外判定 ----
      if (EXCLUDE_STATUS[status]) {
        excluded.push({
          no: val(r, 'レコード番号'),
          出荷先: val(r, F.出荷先),
          商品名: val(r, F.商品名),
          個口数: val(r, F.個口数),
          理由: EXCLUDE_STATUS[status]
        });
        return;
      }

      // ---- グループキー: 出荷先 × 納品日 ----
      // 出荷先が空のレコードは互いにマージされないよう、レコード番号を単独キーにする
      var dest = val(r, F.出荷先);
      var key = dest
        ? dest + '\u0001' + val(r, F.納品日)
        : '\u0002EMPTY\u0001' + val(r, 'レコード番号');

      if (!map[key]) {
        map[key] = { key: key, head: r, records: [] };
        order.push(key);
      }
      map[key].records.push(r);
    });

    var groups = order.map(function (key) {
      var g = map[key];

      // 個口数: 行単位では丸めず、グループ合計に対して一度だけ切り上げる
      var raw = 0;
      g.records.forEach(function (r) { raw += toNumber(val(r, F.個口数)); });

      g.個口数raw = raw;
      g.個口数 = Math.ceil(raw - 1e-9); // 浮動小数の誤差で 1.0 が 2 にならないよう微小値を引く

      // 送り状に印字する品名は「品名１（佐川ヤマト共用）」を使う。
      // 「商品名」は商品マスタのキー（分類番号付き。例:「1.筑陽なすA品」）であり、
      // 送り状の記載内容としては使わない。
      g.品名 = buildItemName(g.records.map(function (r) { return val(r, F.品名1); }));

      // ポップアップでレコードを特定するための表示用。出力には使わない。
      g.商品名 = buildItemName(g.records.map(function (r) { return val(r, F.商品名); }));
      return g;
    });

    return { groups: groups, excluded: excluded };
  }

  /**
   * 品名の連結。上限を超える場合は「先頭商品 他N件」に置き換える。
   * 同一商品が複数行ある場合は重複を除去する。
   */
  function buildItemName(names) {
    var uniq = [];
    names.forEach(function (n) {
      n = String(n || '').trim();
      if (n && uniq.indexOf(n) === -1) uniq.push(n);
    });
    if (uniq.length === 0) return '';

    var joined = uniq.join(ITEM_NAME_SEPARATOR);
    if (strWidth(joined) <= ITEM_NAME_MAX_WIDTH) return joined;

    if (uniq.length > 1) {
      var suffix = ' 他' + (uniq.length - 1) + '件';
      var room = ITEM_NAME_MAX_WIDTH - strWidth(suffix);
      return truncateByWidth(uniq[0], room) + suffix;
    }
    return truncateByWidth(uniq[0], ITEM_NAME_MAX_WIDTH);
  }

  // ==========================================================================
  // 5. 警告判定
  // ==========================================================================

  /** 必須項目の欠落などを検出する（出力からは除外せず、警告のみ出す） */
  function collectWarnings(groups, carrier) {
    var warnings = [];

    groups.forEach(function (g) {
      var h = g.head;
      var msgs = [];

      if (!val(h, F.出荷先)) msgs.push('出荷先が空');
      if (g.個口数raw <= 0) msgs.push('個口数が空または0');
      if (!g.品名) msgs.push('品名１が空（商品マスタ未登録の可能性）');

      if (carrier === 'yamato') {
        var yamatoRequired = [
          ['お届け先電話番号', F.お届け先電話番号],
          ['お届け先郵便番号', F.お届け先郵便番号],
          ['お届け先住所', F.お届け先住所],
          ['お届け先名', F.お届け先名],
          ['ご依頼主電話番号', F.ご依頼主電話番号],
          ['ご依頼主郵便番号', F.ご依頼主郵便番号],
          ['ご依頼主住所', F.ご依頼主住所],
          ['ご依頼主名', F.ご依頼主名],
          ['請求先顧客コード', F.請求先顧客コード],
          ['運賃管理番号', F.運賃管理番号]
        ];
        var missing = yamatoRequired
          .filter(function (p) { return !stripQuote(val(h, p[1])); })
          .map(function (p) { return p[0]; });
        if (missing.length) msgs.push('ヤマト必須項目が空: ' + missing.join(' / '));

        var pc = padPostal(val(h, F.お届け先郵便番号));
        if (pc && pc.length !== 7) msgs.push('お届け先郵便番号の桁数が不正: ' + pc);
        if (g.個口数 > 99) msgs.push('発行枚数が99を超過: ' + g.個口数);
      } else {
        var sagawaRequired = [
          ['住所録コード', F.住所録コード],
          ['依頼主コード', F.依頼主コード]
        ];
        var missS = sagawaRequired
          .filter(function (p) { return !stripQuote(val(h, p[1])); })
          .map(function (p) { return p[0]; });
        if (missS.length) msgs.push('佐川必須項目が空: ' + missS.join(' / '));
      }

      if (msgs.length) {
        warnings.push({
          no: g.records.map(function (r) { return val(r, 'レコード番号'); }).join(', '),
          出荷先: val(h, F.出荷先) || '(空欄)',
          商品名: g.商品名 || '(空欄)',
          内容: msgs
        });
      }
    });

    return warnings;
  }

  // ==========================================================================
  // 6. 佐川 CSV 生成
  // ==========================================================================

  function buildSagawaRow(g) {
    var h = g.head;
    return [
      val(h, F.出荷先),
      stripQuote(val(h, F.住所コード区分)),
      stripQuote(val(h, F.住所録コード)),
      stripQuote(val(h, F.依頼主コード区分)),
      stripQuote(val(h, F.依頼主コード)),
      stripQuote(val(h, F.荷姿コード)),
      g.品名,
      String(g.個口数),
      stripQuote(val(h, F.スピード指定)),
      stripQuote(val(h, F.クール便指定)),
      toSlashDate(val(h, F.納品日)),
      stripQuote(val(h, F.配達時間帯指定))
    ];
  }

  /** kintone純正エクスポートと同じ形式（全項目クォート囲み / LF / 末尾改行あり） */
  function toCsvText(header, rows) {
    function cell(v) {
      return '"' + String(v == null ? '' : v).replace(/"/g, '""') + '"';
    }
    var lines = [header.map(cell).join(',')];
    rows.forEach(function (r) { lines.push(r.map(cell).join(',')); });
    return lines.join('\n') + '\n';
  }

  /** UTF-16文字列 → CP932(Shift_JIS)のBlob */
  function toSjisBlob(text) {
    var unicodeArray = Encoding.stringToCode(text);
    var sjisArray = Encoding.convert(unicodeArray, { to: 'SJIS', from: 'UNICODE' });
    return new Blob([new Uint8Array(sjisArray)], { type: 'text/csv' });
  }

  function exportSagawa(groups, fileDate) {
    var rows = groups.map(buildSagawaRow);
    var text = toCsvText(SAGAWA_HEADER, rows);
    var blob = toSjisBlob(text);
    downloadBlob(blob, '受注管理_選果場出荷物_佐川_' + fileDate + '.csv');
    return Promise.resolve();
  }

  // ==========================================================================
  // 7. ヤマト xlsx 生成
  // ==========================================================================

  function buildYamatoRow(g) {
    var h = g.head;
    return [
      toNumber(val(h, F.送り状種類)),          // A 送り状種類
      toSlashDate(val(h, F.出荷予定日)),        // B 出荷予定日（文字列）
      toSlashDate(val(h, F.納品日)),            // C お届け予定日（文字列）
      stripQuote(val(h, F.配達時間帯)),         // D 配達時間帯
      val(h, F.お届け先電話番号),               // E
      padPostal(val(h, F.お届け先郵便番号)),    // F
      val(h, F.お届け先住所),                   // G
      val(h, F.お届け先会社部門1),              // H
      val(h, F.お届け先名),                     // I
      val(h, F.敬称),                           // J
      val(h, F.ご依頼主電話番号),               // K
      padPostal(val(h, F.ご依頼主郵便番号)),    // L
      val(h, F.ご依頼主住所),                   // M
      val(h, F.ご依頼主名),                     // N
      g.品名,                                    // O 品名１
      g.個口数,                                  // P 発行枚数（合算後の切り上げ値）
      toNumber(val(h, F.個口数表示フラグ)),     // Q 個数口表示フラグ
      stripQuote(val(h, F.請求先顧客コード)),   // R
      stripQuote(val(h, F.運賃管理番号))        // S
    ];
  }

  function base64ToUint8Array(b64) {
    var bin = atob(b64);
    var arr = new Uint8Array(bin.length);
    for (var i = 0; i < bin.length; i++) arr[i] = bin.charCodeAt(i);
    return arr;
  }

  function exportYamato(groups, fileDate) {
    var bytes = base64ToUint8Array(window.SF_YAMATO_TEMPLATE_BASE64);
    var wb = new ExcelJS.Workbook();

    return wb.xlsx.load(bytes.buffer).then(function () {
      var ws = wb.worksheets[0];

      groups.forEach(function (g, i) {
        var values = buildYamatoRow(g);
        var row = ws.getRow(i + 2); // 1行目はヘッダーなので2行目から
        values.forEach(function (v, ci) {
          var cell = row.getCell(ci + 1);
          cell.value = v;
          // B・C列を含む文字列項目は明示的に「@」書式にして、
          // Excelの自動変換（日付の米国式表記化・先頭0落ち）を完全に防ぐ
          cell.numFmt = (YAMATO_TEXT_COLUMNS.indexOf(ci + 1) >= 0) ? '@' : 'General';
        });
        row.commit();
      });

      return wb.xlsx.writeBuffer();
    }).then(function (buf) {
      var blob = new Blob([buf], {
        type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
      });
      downloadBlob(blob, '受注管理_選果場出荷物_ヤマト_' + fileDate + '.xlsx');
    });
  }

  // ==========================================================================
  // 8. ダウンロード
  // ==========================================================================

  function downloadBlob(blob, filename) {
    if (window.navigator && window.navigator.msSaveBlob) {
      window.navigator.msSaveBlob(blob, filename);
      return;
    }
    var url = URL.createObjectURL(blob);
    var a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.style.display = 'none';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(function () { URL.revokeObjectURL(url); }, 1000);
  }

  // ==========================================================================
  // 9. 確認ポップアップ
  // ==========================================================================

  /**
   * 除外・警告が1件でもあれば確認ダイアログを表示する。
   * 0件のときは何も表示せず即座に resolve（＝そのままダウンロード）。
   */
  function confirmDialog(summary, excluded, warnings) {
    if (excluded.length === 0 && warnings.length === 0) return Promise.resolve(true);

    return new Promise(function (resolve) {
      var overlay = document.createElement('div');
      overlay.id = MODAL_ID;
      overlay.style.cssText = [
        'position:fixed', 'inset:0', 'background:rgba(0,0,0,.45)',
        'z-index:100000', 'display:flex', 'align-items:center',
        'justify-content:center', 'padding:24px'
      ].join(';');

      var box = document.createElement('div');
      box.style.cssText = [
        'background:#fff', 'border-radius:6px', 'max-width:900px', 'width:100%',
        'max-height:82vh', 'display:flex', 'flex-direction:column',
        'box-shadow:0 8px 32px rgba(0,0,0,.3)',
        'font-family:"メイリオ",Meiryo,sans-serif', 'font-size:13px'
      ].join(';');

      var html = '';
      html += '<div style="padding:16px 20px;border-bottom:1px solid #e3e7e8;">'
           +  '<div style="font-size:16px;font-weight:bold;">送り状データ出力の確認</div>'
           +  '<div style="margin-top:6px;color:#3498db;">' + escapeHtml(summary) + '</div>'
           +  '</div>';

      html += '<div style="padding:16px 20px;overflow-y:auto;flex:1;">';

      if (excluded.length) {
        html += '<div style="font-weight:bold;color:#e74c3c;margin-bottom:8px;">'
             +  '■ 出力から除外したレコード（' + excluded.length + '件）</div>'
             +  '<table style="width:100%;border-collapse:collapse;margin-bottom:20px;">'
             +  '<tr style="background:#f7f9fa;">'
             +  '<th style="' + thStyle() + '">レコード番号</th>'
             +  '<th style="' + thStyle() + '">出荷先</th>'
             +  '<th style="' + thStyle() + '">商品名</th>'
             +  '<th style="' + thStyle() + '">個口数</th>'
             +  '<th style="' + thStyle() + '">理由</th></tr>';
        excluded.forEach(function (e) {
          html += '<tr>'
               +  '<td style="' + tdStyle() + '">' + escapeHtml(e.no) + '</td>'
               +  '<td style="' + tdStyle() + '">' + escapeHtml(e.出荷先) + '</td>'
               +  '<td style="' + tdStyle() + '">' + escapeHtml(e.商品名) + '</td>'
               +  '<td style="' + tdStyle() + '">' + escapeHtml(e.個口数) + '</td>'
               +  '<td style="' + tdStyle() + 'color:#e74c3c;">' + escapeHtml(e.理由) + '</td>'
               +  '</tr>';
        });
        html += '</table>';
      }

      if (warnings.length) {
        html += '<div style="font-weight:bold;color:#e67e22;margin-bottom:8px;">'
             +  '■ 警告（' + warnings.length + '件）'
             +  '<span style="font-weight:normal;color:#666;margin-left:8px;">'
             +  'これらは出力に含まれます。取込エラーの原因になる場合はマスタを修正してください。</span></div>'
             +  '<table style="width:100%;border-collapse:collapse;">'
             +  '<tr style="background:#f7f9fa;">'
             +  '<th style="' + thStyle() + '">レコード番号</th>'
             +  '<th style="' + thStyle() + '">出荷先</th>'
             +  '<th style="' + thStyle() + '">商品名</th>'
             +  '<th style="' + thStyle() + '">警告内容</th></tr>';
        warnings.forEach(function (w) {
          html += '<tr>'
               +  '<td style="' + tdStyle() + '">' + escapeHtml(w.no) + '</td>'
               +  '<td style="' + tdStyle() + '">' + escapeHtml(w.出荷先) + '</td>'
               +  '<td style="' + tdStyle() + '">' + escapeHtml(w.商品名) + '</td>'
               +  '<td style="' + tdStyle() + 'color:#e67e22;">'
               +  w.内容.map(escapeHtml).join('<br>') + '</td>'
               +  '</tr>';
        });
        html += '</table>';
      }

      html += '</div>';

      html += '<div style="padding:12px 20px;border-top:1px solid #e3e7e8;text-align:right;">'
           +  '<button id="sf-modal-cancel" style="' + btnStyle('#fff', '#333') + '">キャンセル</button>'
           +  '<button id="sf-modal-ok" style="' + btnStyle('#3498db', '#fff') + 'margin-left:8px;">この内容で出力</button>'
           +  '</div>';

      box.innerHTML = html;
      overlay.appendChild(box);
      document.body.appendChild(overlay);

      function close(result) {
        if (overlay.parentNode) overlay.parentNode.removeChild(overlay);
        resolve(result);
      }
      box.querySelector('#sf-modal-ok').onclick = function () { close(true); };
      box.querySelector('#sf-modal-cancel').onclick = function () { close(false); };
      overlay.onclick = function (ev) { if (ev.target === overlay) close(false); };
    });
  }

  function thStyle() {
    return 'border:1px solid #e3e7e8;padding:6px 8px;text-align:left;white-space:nowrap;';
  }
  function tdStyle() {
    return 'border:1px solid #e3e7e8;padding:6px 8px;vertical-align:top;';
  }
  function btnStyle(bg, color) {
    return 'padding:7px 18px;border:1px solid #ccc;border-radius:3px;cursor:pointer;'
         + 'background:' + bg + ';color:' + color + ';font-size:13px;';
  }

  // ==========================================================================
  // 10. メイン処理
  // ==========================================================================

  function run(carrier, button) {
    var original = button.textContent;
    button.disabled = true;
    button.textContent = '集計中...';

    return fetchAllRecords(kintone.app.getId()).then(function (records) {
      if (records.length === 0) {
        alert('対象レコードがありません。');
        return;
      }

      var built = buildGroups(records);
      var groups = built.groups;
      var excluded = built.excluded;

      if (groups.length === 0) {
        alert('出力対象のレコードがありません。\n'
            + '（' + records.length + '件すべてがキャンセルまたは出荷済のため除外されました）');
        return;
      }

      var warnings = collectWarnings(groups, carrier);

      var mergedCount = records.length - excluded.length - groups.length;
      var summary = '対象 ' + records.length + '件 → 除外 ' + excluded.length + '件 → '
                  + '送り状 ' + groups.length + '件'
                  + (mergedCount > 0 ? '（' + mergedCount + '件をマージ）' : '');

      return confirmDialog(summary, excluded, warnings).then(function (ok) {
        if (!ok) return;

        button.textContent = 'ファイル生成中...';

        // ファイル名の日付は出荷予定日（先頭レコード基準）
        var fileDate = toCompactDate(val(groups[0].head, F.出荷予定日));
        if (!fileDate) {
          var d = new Date();
          fileDate = d.getFullYear()
                   + ('0' + (d.getMonth() + 1)).slice(-2)
                   + ('0' + d.getDate()).slice(-2);
        }

        return (carrier === 'yamato')
          ? exportYamato(groups, fileDate)
          : exportSagawa(groups, fileDate);
      });
    }).catch(function (err) {
      console.error(err);
      alert('出力に失敗しました。\n\n' + (err && (err.message || err.error) || err));
    }).then(function () {
      button.disabled = false;
      button.textContent = original;
    });
  }

  // ==========================================================================
  // 11. ボタン設置
  // ==========================================================================

  kintone.events.on('app.record.index.show', function (event) {
    var config = VIEWS[event.viewId];
    if (!config) return event;

    if (document.getElementById(BUTTON_ID)) return event;

    var space = kintone.app.getHeaderMenuSpaceElement();
    if (!space) return event;

    var isYamato = config.carrier === 'yamato';

    var button = document.createElement('button');
    button.id = BUTTON_ID;
    button.textContent = isYamato ? 'ヤマト送り状データ出力（xlsx）' : '佐川送り状データ出力（CSV）';
    button.style.cssText = [
      'padding:7px 16px', 'border:1px solid #3498db', 'border-radius:3px',
      'background:#3498db', 'color:#fff', 'cursor:pointer',
      'font-size:13px', 'font-family:"メイリオ",Meiryo,sans-serif'
    ].join(';');

    button.onclick = function () {
      // 依存ライブラリの読み込み確認
      if (isYamato) {
        if (typeof ExcelJS === 'undefined') {
          alert('ExcelJS が読み込まれていません。\n'
              + 'アプリのJavaScriptカスタマイズ設定でCDNのURLを確認してください。');
          return;
        }
        if (typeof window.SF_YAMATO_TEMPLATE_BASE64 === 'undefined') {
          alert('ヤマトテンプレート（sf_yamato_template.js）が読み込まれていません。');
          return;
        }
      } else {
        if (typeof Encoding === 'undefined') {
          alert('encoding-japanese が読み込まれていません。\n'
              + 'アプリのJavaScriptカスタマイズ設定でCDNのURLを確認してください。');
          return;
        }
      }
      return run(config.carrier, button);
    };

    space.appendChild(button);
    return event;
  });

})();
