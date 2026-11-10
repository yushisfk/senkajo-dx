# 選果場DX - Claude Code Instructions

## Project

This repository is for the 選果場DX project.

The system is based on kintone.

## Source documents and priority

Read these before design or implementation work:

Start with `docs/00_project/PROJECT_STATUS.md` (current progress, open decisions, next tasks). It is an entry point, NOT a spec; if it disagrees with the documents below, they win.

1. `docs/00_project/PROJECT_KNOWLEDGE_BASELINE.md` - integrated baseline of business premises and design policy (highest priority; v0.11, 2026-11-11)
2. `docs/00_project/BASIC_ARCHITECTURE.md` - high-level design (Part I: V2 policy / Part II: current As-Is; v0.13, 2026-11-11)
3. `docs/00_project/DECISION_LOG.md` - decision history (superseded entries are annotated, not deleted)
4. `docs/10_as_is/` - As-Is records of the existing production kintone apps
   - `docs/10_as_is/KINTONE_MCP_ASIS_SURVEY_20261106.md` - read-only kintone MCP survey of 8 existing apps (app IDs, field definitions, references, 出荷Lot and 送り状番号 practice)
   - `docs/10_as_is/FIELD_CONFIRMATION_STATUS_20261107.md` - field questionnaires: what was asked, what was answered, what is open (avoid re-asking)

Formal design documents under `docs/20_design/` detail the documents above and are kept in sync with them:

- `docs/20_design/ORDER_SHIPPING_V2_DATA_MODEL.md` - business data model of 統合受注管理V2 and 出荷管理V2 (v0.10, 2026-11-11)
- `docs/20_design/PRODUCT_MASTER_V2_DESIGN.md` - 商品マスタV2 detailed design, REVIEW DRAFT (not a formal spec). Only the user decisions recorded in DECISION_LOG "2026-11-08（商品マスタV2の業務判断）" and "2026-11-08（商品マスタV2第3段の業務判断）" and "2026-11-09（設定値の現場管理の原則・旧No.22/128の確認）" and "2026-11-09（商品マスタV2第4段の業務方針：初期登録・サンプル出荷・物理SKUの現場主導）" and "2026-11-10〜2026-11-11（在庫判定保留・在庫不足の業務方針と本番詳細設計の技術方針）" are confirmed; its 第一案/候補/未確定 stay unconfirmed

The business specs of なす仕切り管理V2, いちご製造計画V2 and いちご受託加工管理V2 live in `BASIC_ARCHITECTURE.md` (v0.13).

Draft or review files from ChatGPT (e.g. under `local-data/`) are NOT formal documents until they are synced into the files above.

If documents conflict, follow the order above.

Respect the status labels in those documents ("確定" / "方向" / "第一案" / "候補" / "未確定").
Never treat a first draft, candidate, or undecided item as a confirmed specification.

## Roles

ChatGPT:
- business requirements
- business rules
- overall architecture
- business decisions on the data model
- acceptance criteria

Claude Code:
- repository investigation
- existing implementation and kintone template investigation
- technical design
- implementation planning
- implementation
- testing

Do not independently change business rules or the core data model.

If implementation requires changing a business rule or core data model,
stop and report the issue before implementation.

GitHub collaboration (since 2026-11-08; details in `docs/00_project/PROJECT_OVERVIEW.md`):
- The formal documents on GitHub (`yushisfk/senkajo-dx`, master) are the project baseline. ChatGPT reads them directly when its connection is available, but may not see local uncommitted files.
- Claude Code handles local changes, technical design, implementation and Git operations. Keep GitHub in sync; commit/push only with the user's approval.

## Development workflow

1. Read the relevant documents under docs/.
2. Investigate the existing implementation and local reference files.
3. For major changes, use Plan Mode first.
4. Do not modify code until the plan is reviewed when instructed.
5. Keep documentation synchronized with confirmed decisions and implementation
   (DECISION_LOG.md -> BASIC_ARCHITECTURE.md etc. -> baseline if needed).

## Core architecture (V2)

### Development policy (confirmed)

- Do NOT modify the existing production kintone apps. They are in use all year round.
- Build V2 as a separate, new set of kintone apps.
- Switch production to V2 only after V2 is completed and verified.
- Use the existing apps only for As-Is investigation and historical data reference.
- Existing apps, JS, views, and graphs are sources for requirements, not code to reuse as-is.
  - The existing JS baseline is kept in `src/existing/` for reference only.
- Do not reuse old field codes in V2. Some are inconsistent between apps.
  - Example: `ラジオボタン_0` means 出荷 in one app and 発注 in another.
- Use meaningful alphanumeric field codes in V2.

### V2 app composition (business separation confirmed; physical kintone app count is technical design)

- 商品マスタV2 (common)
- 顧客マスタV2 / 出荷先マスタV2 / 生産者マスタV2 (common)
- 統合受注管理V2 (common)
- なす仕切り管理V2 (nasu only)
- いちご製造計画V2 (strawberry only)
- いちご受託加工管理V2 (strawberry only; contains the SF買取仕切り function)
- 在庫管理V2 (common business base for nasu and strawberry)
- 出荷管理V2 (common app; records and screens are per item)

External: 苺流通システム (producers' weekly entries and allocation to the SF 選果場; not replaced) and FLAM.
The old single "仕切り管理V2" was split on 2026-10-09.

Large monitor views and tablet screens are UI, not separate databases.

### V2-wide principles (confirmed)

- Default values are set automatically from masters/rules and saved as snapshots on the record. People edit only exceptions.
- Link to masters by ID; keep names as snapshots.
- Business setting values are managed by the field in the masters; the system works correctly from those settings (confirmed 2026-11-09).
  - Materials used per product, material types, standard usage and label counts are set and changed by field staff in the master. Never hard-code per-product quantities; changing a setting must not require a program change.
  - The system stores settings, calculates requirements, forecasts shortages, warns when a setting is missing, and keeps change history. Setting changes never silently alter finalized past orders/shipments.
  - Per-product material quantities and label counts are field initial-setup items, not management decisions at development time. Do not decide them yourself and do not ask management for each value. A長's 27 labels per case is the confirmed current setting value, stored as a changeable master value, not fixed in code.
  - The same applies to physical SKUs (confirmed 2026-11-09, M-3): the field decides whether individual products are the same or different physical SKUs and registers/changes the sales product x physical SKU links. Development designs the structure and screens, processes orders/shipments/stock by those settings, warns on inconsistencies, and keeps change history. Never decide or merge individual products' physical SKUs yourself.
  - Ask management only about system-wide rules, scope and important business policies.
- Do not stop field operations because of system inconsistencies.
  - Stock shortage, missing Lot, missing 送り状番号 etc. raise a warning; the user records an exception reason and continues.
  - Only operations that would create duplicate IDs, destroy data or make records unidentifiable are strictly blocked.
- Quantity units are a per-product attribute: なす = cases (c/s), いちご = packs (P).
  - Strawberry 230g-equivalent packs are used ONLY for allocation and fairness comparison between producers.

### 統合受注管理V2 (integrated order management)

- 選果場 orders and 産直 orders are integrated into one V2 app.
- Scope (confirmed 2026-11-06): all items, including items other than nasu/strawberry.
  - They are currently split into 受注管理（選果場出荷物） and 受注管理（産直出荷物）.
- Record granularity (confirmed): 1 record = 1 受注明細.
  - Lines with the same 得意先 x 出荷先 x 出荷予定日 x 納品日 x 商品 x 出荷区分 are merged (quantity added).
  - The order line holds a 指定物理SKU (designated physical SKU, e.g. A長70本入 vs 80本入); lines merge only if it is also the same (confirmed 2026-11-08).
  - The order line also holds ラベル要否 (enclosed label yes/no); lines merge only if it is also the same (confirmed 2026-11-08, C-01). Existing conditions and exceptions (different 発送元 etc.) stay. In the FLAM export, lines with the same product code and slip conditions may be summed across label yes/no.
  - This combination is NOT a unique key. Use the immutable, auto-numbered 受注明細ID.
- 出荷区分 (選果場出荷 / 産直出荷, confirmed) is held per order line.
  - Keep the value "産直出荷". ChatGPT drafts may write "産地出荷"; treat it as the same value and do not rename.
  - It is NOT fixed per 出荷先. The same 出荷先 can have both kinds.
  - Never infer it from the product name or the product-name prefix number.
  - Default comes from a 出荷先 x 商品 rule. The rule management UI is not finalized.
- The old 産直 "発注" function is abolished. Do not port views or graphs that filter on 発注.
- "追加" is not a status. It is a change of the ordered quantity.
- Status values (confirmed): 受注状態 = 有効 / キャンセル, 出荷状態 = 未出荷 / 出荷済.
- Cancellation keeps the original quantity. Never set it to 0. Do not delete real orders.
- Important changes are kept as 受注変更履歴 (not only kintone's built-in history). The implementation method is not finalized.
- The old mixed 出荷 field (未出荷/出荷済/キャンセル/追加) is not carried over to V2.
- Samples are out of scope of the normal order flow in the initial version.
  - Sample / irregular shipments ARE recorded in V2 (confirmed 2026-11-09, M-2). Do not create generic dummy products (like old No.34 "サンプル出荷・イレギュラー出荷" / No.59 "その他") in principle; register the needed products by their actual content. Recording shipments is separate from initially registering every sample product. Old No.131 (丸なす sample) is not registered. How samples are distinguished (FLAM/monitor/stock) and how shipments of unregistered products are recorded are technical design.
- 産直出荷 is handled entirely in 統合受注管理V2: a person registers 出荷済 manually. It creates NO 出荷管理V2 record and NO inventory event.
- The same order must not be registered or counted twice via 苺流通システム and another route.

### 出荷管理V2 (shipping management)

- Order management and shipping management are separate apps.
- 送り状番号, 物流業者, 出荷Lot, actual shipment lines, and 出荷完了 belong to shipping management.
- Never require people to enter the same information into both order and shipping management.
  - Carry order data over automatically.
- Scope: 選果場出荷 only. Common app for nasu and strawberry; records and screens are per item.
  - Covers all items shipped from the 選果場, not only nasu/strawberry (confirmed 2026-11-06). Units, grouping and mixed-loading conditions for other items are undecided.
- Record granularity (confirmed): 1 record = 1 physical shipment, identified by 出荷ID.
  - A planned-shipment record is auto-created when a 選果場出荷 order is registered.
  - Default grouping candidate: 出荷日 x 納品日 x 出荷先 x 得意先 x 発送元 x 品目. This is NOT a unique key; the final rule is technical design.
- Never mix なす and いちご in the same truck/送り状/shipment record (confirmed).
- Status: 未出荷 / 出荷完了 only.
- 代表送り状番号: at most one per physical shipment (Yamato: the lowest number; others may be empty).
  - The old rule "one number even for 10 parcels" was corrected on 2026-10-08.
  - Current practice (As-Is): screenshots of the carriers' cloud invoice systems (Yamato and Sagawa) are attached per shipping date in the existing app 送り状番号管理 (ID 34), to avoid manual input. Recording invoice numbers in V2 must not add input burden.
  - Importing the carriers' issued-invoice data (CSV etc.) into V2 is a candidate only. Not decided; do not implement it as a confirmed spec.
- Actual shipment lines are generated from order lines. AB混合/BC混合 are split into allowed physical products; inventory is reduced by the actual shipped product.
- The known 6-digit 出荷Lot format is current nasu practice. Do not impose it on strawberry; strawberry Lot format/input is to be investigated.
  - The physical label on current products is 6 digits (confirmed). The composition 商品Lot + 日付Lot + 生産者Lot is expected to be unchanged (not strictly re-verified).
  - The existing kintone app mostly holds 4-digit input (confirmed from data), presumably 日付Lot + 生産者Lot with 商品Lot omitted.
  - Do not confuse this 4-digit input with the 4-digit inventory Lot display (商品Lot + 日付Lot).
  - V2 input method, whether to accept 4-digit input, and auto-completion to 6 digits are undecided.
- One actual shipment line may have multiple 出荷Lot. Per-Lot quantities are allocated by FIFO automatically (strawberry: by pack date within the same producer and SKU).
- After 出荷完了, record errors may be corrected only with change history and a stock difference adjustment. No silent overwrite, no double issue.
  - Real returns / reshipments are recorded as 出荷後例外 plus stock adjustment when needed (initial version).

### Large monitor (選果場モニター)

- It does NOT display order lines as they are.
- It shows "本日、選果場でどの規格がどれだけ必要か": required quantity per grade/spec.
- Target items for now: なす (cases) and いちご (packs, per customer and grade), on completely separate screens.
  - Strawberry orders are already in packs. Do NOT convert cases to packs.
  - Strawberry target = 苺流通システム allocation to the SF 選果場 (Allied) + 選果場出荷 orders of other customers, without double counting.
- The V2 monitor is used from the system migration date T. Before T, paper.
  - Old-app orders are not migrated and therefore not on the V2 monitor. How the field covers them between T and their completion is an UNDECIDED operational item to resolve before go-live. Do not decide it on your own.
- 産直出荷 is out of scope.
- Even 選果場出荷 items may be out of scope, for example finished goods brought in from producers and shipped as-is.
  - Do not decide monitor targets by 出荷区分 alone.
  - Decide them by explicit attributes on the product master etc. Attribute names are still candidates.
- Monitor data is derived from order data. It is never entered manually and is not a source of truth.

### Product classification

- Never use the product-name prefix number (e.g. "1.", "15.") as a classification key.
  - Do not use it for DX-target, inventory, or monitor decisions.
- `senkajo_dx_target` (選果場DX対象) on the existing product master was intentionally added by the user.
  - It is not an accidental production change.
  - It is NOT used in V2 (confirmed 2026-11-06) and is not a 商品マスタV2 attribute. Do not delete or change the field in the existing app.
  - Use the V2 attributes (モニター集計対象, 選果場在庫管理対象, 出荷Lot管理対象, etc.) instead.
- Do not treat 商品Lot as a unique key. It is a field in the product master, not a separate master.
  - Its business meaning is not fully confirmed.
- Later decisions synced on 2026-11-07 (details: BASELINE §4.1, §11.7-§11.8, §17.3, DECISION_LOG "2026-10-10〜2026-11-07"):
  - Confirmed: never delete/change old product master records; 丸なす (とろとろ炒めなす) is out of the initial V2 scope, 火の国なす is 筑陽なす and stays in; old No.1/54/136 = 3 sales products sharing one physical SKU; 2-bag A長 and 2/3-piece packs are physical SKUs separate from normal cases. "Old No." = record number of existing app 8.
  - Confirmed policy: a separate 資材マスタ, with standard materials and quantities linked per product; label yes/no chosen at order entry with an auto-calculated label count. (Details decided on 2026-11-08 in stage 3; see below.)
  - Confirmed scope (approved 2026-11-06): 商品マスタV2 and 統合受注管理V2 = all items incl. non-nasu/strawberry; 出荷管理V2 = all items shipped from the 選果場; 在庫管理V2 and Lot management = nasu/strawberry-centered initially; monitor = nasu/strawberry only. Managing all items in orders does NOT mean implementing inventory/sorting/shikiri for all products initially. Per-product registration and detailed attributes of other items are undecided.
- Synced on 2026-11-08 (details: DECISION_LOG "2026-11-08", BASELINE §11.6-§11.7, §16, §17):
  - Confirmed: A長70本 and 80本 are ONE sales product (same order product name all season) and separate physical SKUs; the order line distinguishes the actual case count. The UI/field for this is detail design.
  - Confirmed: items are identified individually (トマト and ミニトマト are separate products and separate item classes); new items can be added. Item code system / separate item master are detail design.
  - Field wishes (FLAM CSV buttons, strawberry purchase confirmed by the office = "B案") are NOT V2 specs until the user approves them. (The 資材 inventory wish was adopted in part on 2026-11-08: Mon/Thu stocktake counts are the basis.)
- Synced on 2026-11-08, product master decisions (details: DECISION_LOG "2026-11-08（商品マスタV2の業務判断）", BASELINE §5.1, §11.6, §11.7, §11.9):
  - Order line keeps a 指定物理SKU and it is part of the merge condition. Do NOT extend this to AB/BC混合: they are still split into allowed physical SKUs at actual shipment.
  - Default 指定物理SKU = registered standard value (considering customer / destination), changed only for exceptions; no fixed seasonal auto-switch in the initial version; changing the standard never silently rewrites registered orders. Field: same customer/destination/day never mixes 70本 and 80本 today, but the system does not forbid it.
  - One 品目マスタ app; 商品マスタV2 references it by item ID. No per-item product master apps.
  - 品種 = optional attribute. 等級区分 / 在庫商品区分 are not added for now. A structured leftover (半端) grade is set automatically from the physical SKU (not from names; separate from モニター集計規格). Leftover inventory axis/unit/FIFO unchanged.
  - Packaging = two-level structure from the quantity unit, plus a per-grade content breakdown only where needed (e.g. BC2本パック = 30 packs/case, 2 pcs/pack, B1 + C1). 仕切り区分 and content composition are separate concepts. Never treat quantities with undecided conversion as zero.
  - A physical spec change = new physical SKU; non-physical fixes (typos) may edit the SKU; price or C品 weight-conversion changes alone do not create SKUs; master edits never overwrite past orders/shipments/stock.
  - 仮登録 products may have both flags "no" and are excluded from normal order selection; 使用可 needs at least one flag "yes". Products that were ever 使用可 are stopped, never deleted; only unreferenced 仮登録 mistakes may be deleted, after a reference check.
  - Still undecided: field names/storage/UI, standard-value storage and priority, item code system, exception intake for unregistered products, shipping exception handling, BC2本パック C品 conversion, A品10kgバラ piece count, and everything listed as undecided in BASELINE §22.
- Synced on 2026-11-08, product master stage 3 decisions (materials, labels, FLAM; details: DECISION_LOG "2026-11-08（商品マスタV2第3段の業務判断）", BASELINE §5.1, §11.8, §17.3-§17.5):
  - Labels: the order line's label yes/no wins; default comes from 出荷先マスタV2's standard label setting ("店舗" = 出荷先); a mismatch with the sales product's explicit label condition gives a warning and an exception record, never a stop. A長70本入/80本入 = 27 labels per labelled case (roll pre-cut into sets of 27, one set per case). Never use quantities in old product names as a calculation basis. Other products' label counts and the roll's stock unit are field setting values (confirmed 2026-11-09).
  - 資材 inventory: the Mon/Thu stocktake count is the basis; no per-receipt/per-use entry in the initial version; forecast material needs from orders to warn of shortages. Stocktake counts are confirmed values; forecasts/estimated use are estimates; a stocktake difference is not actual consumption. Reuse of the existing stocktake app is decided after inspecting it.
  - 資材マスタ: register all shipping materials in principle; auto-calculate only where standard usage is known; statuses 仮登録/使用可/停止 (never delete once 使用可); distinguish calculable / explicitly none (0) / not calculated; a missing setting is never 0; not-calculated warns but never stops orders or shipping.
  - The calculation method, storage structures and screens are technical design; the review draft's 第一案/候補 are not confirmed.
- Synced on 2026-11-09, product master stage 4 policies (details: DECISION_LOG "2026-11-09（商品マスタV2第4段の業務方針：初期登録・サンプル出荷・物理SKUの現場主導）", BASELINE §11.11):
  - M-1: products with no orders in about the last year are, in principle, NOT initially registered in V2; products whose continued sale or restart is confirmed by sales/office are added as initial candidates. No orders is never proof of discontinuation. Old master records are never deleted. Products can be added later via 仮登録 -> 使用可.
  - M-2: see Samples above. Old No.34/59/180 contents are confirmed by the field.
  - M-3: individual physical SKU classification and sales product links are field decisions (see the V2-wide principles). Keep the confirmed physical SKU rules. Registering a physical SKU is separate from making it a 選果場 inventory target. Old No.22/128 stay separate sales products; their physical SKU composition is a field confirmation item.
  - M-4: whether each physical SKU is a 選果場 inventory target is decided by the field and set in the product master. The system processes stock by that setting, based on the actual shipped physical SKU; the rule "reduce stock only for SF-owned inventory-target SKUs" is unchanged, and non-target SKUs still get 出荷完了 / 出荷済 normally. Never decide individual values (incl. old No.22/128) yourself. Settings screen, permissions, input checks, unset handling, change history and protection of finalized records are technical design.
  - The stage 4 classification of 181 old records (local-data, candidates only) is not a registration decision; do not change it mechanically from these policies.
  - UNDER REVIEW: AB/BC混合. The confirmed rule "no physical mixed boxes" still stands, but a 2026-11-07 proposal to keep mixed boxes (count B/C at sorting, mix by fixed counts) is NOT approved and awaits 営業・選果場 discussion and the user's decision. Do not design new box specs or SKUs on either assumption until decided.

### いちご (strawberry) production and contract processing

- いちご製造計画V2: weekly target per customer SKU (packs). Producer-level SF purchase targets are allocated by the ratio of 苺流通システム allocations to the SF 選果場 (230g-equivalent). Targets are guides, not caps.
- Which customer SKU each producer makes is decided by the 選果場 by quality. Never fix producer x customer combinations in the system.
- いちご受託加工管理V2: all finished SKUs count as contract-processing quantity. Only SKUs with 加工後取扱区分 = SF買取 generate purchase candidates; SF inventory increases only after a person confirms the purchase.
- 生産者返却 SKUs never enter SF inventory. Do not track their handover date or unreturned quantity.
- Processing fees and amounts are out of scope (FLAM etc.).
  - As-Is (user-verified 2026-11-08, correcting field answer Q09): the processing fee is booked in FLAM as sales ("業務受託手数料") AND offset against the purchase payment to the producer. These are separate concepts. Which CSV/slip realizes each is undecided until the FLAM spec is checked; avoid double counting.

### Inventory

- Initial inventory events: 入庫 (なす仕切り確定 / いちご買取確定) / 出荷 / 在庫調整.
- A shipment reduces stock only for actual physical SKUs judged as SF-owned inventory targets by the product master etc. A 選果場出荷 is not always an inventory target; 出荷完了 and the order's 出荷済 update still work normally for non-target SKUs.
- Common inventory base for nasu and strawberry; axes and units differ per item. Physical app count is technical design.
- Strict repacking or conversion history is not required in the initial version. Handle it with 在庫調整.
- 産直出荷 is outside 選果場 inventory.
- Finished-goods inventory: physical SKU x actual date x 日付Lot, quantity in cases. Different case counts (e.g. A長80本入 / A長70本入) are different SKUs.
- Leftover (半端) inventory: grade (規格) x actual date x 日付Lot, quantity in pieces (本数). It is FIFO too; never aggregate by grade alone and lose the date.
- The producer number is not an inventory axis. On repacking, carry over the oldest actual date and 日付Lot.
- Strawberry SF inventory: producer x physical SKU x pack date, quantity in packs, FIFO. Only SF-purchased goods. No per-customer ownership or exclusive allocation.
- C品 inventory is in cases. C品 shikiri quantity in なす仕切り管理V2 is kg (confirmed 2026-10-09).
- なす仕切り管理V2: 1 record = one sorting work session of a producer. A/B in pieces; work quantity = finished cases in pieces + ending leftover - carried-over starting leftover.
- Do not guess product-specific values (case counts, packs per case, parcel rules). They come from the product master design.

### Migration (confirmed 2026-10-09)

- Old orders and shipments are migrated 0 records, including unshipped ones. Old orders are completed in the old apps. No double entry of new orders.
- なす and いちご switch on the same system migration date T.
- The official inventory start date S is a separate management start date from T, set when all old unshipped orders are completed and the stocktake/correction is done (S >= T; they are not required to be different calendar days). V2 stock between T and S is provisional.
- At S, register correct balances per confirmed inventory axis (nasu finished: SKU x date x 日付Lot; nasu leftover: grade x date x 日付Lot; strawberry: producer x SKU x pack date), with history. Not product totals.

### FLAM

- Sales management is done in FLAM.
  - Today, orders are entered in kintone and then re-entered in FLAM (double entry).
- Never design kintone products as 1:1 with FLAM product codes.
- FLAM import data: the initial version implements BOTH a sales CSV and a purchase CSV (confirmed 2026-11-08, stage 3). Purchase covers nasu producer purchases and strawberry SF purchases.
  - The concrete CSV spec (layout, units, timing, red slips), concrete FLAM codes, the purchase-side mapping key, the purchase slip date basis and the strawberry processing-fee slips are undecided until real FLAM data is checked. Do not guess them.
  - Sales and purchase codes, validity periods and switch conditions are independent. The office enters FLAM codes from the 商品マスタ screen as "new code + start date"; old codes/periods are kept as history; an internal mapping table is allowed but staff never edit a complex table directly. Do not assume a bulk load of all FLAM codes; initial codes come from the past year's FLAM transactions. Do not force a per-product key for purchase codes.
  - Finalized past CSV outputs are never rewritten by master changes (codes or date basis).
  - Using the 指定物理SKU to pick a FLAM code is compatible with not exporting physical SKUs.
  - Direction only: convert by 販売商品 x 得意先 x 納品日; nasu price periods as effective-period rules (no hard-coded dates). Missing/ambiguous FLAM mapping stops only the FLAM export, never shipping.
  - Confirmed (2026-11-07): send the order product sold to the customer and the actual delivered quantity; physical SKUs are in principle not sent. As-Is fact: the delivery-note date basis differs per customer (出荷日 or 納品日). The sales slip date basis is held in 顧客マスタV2 (confirmed 2026-11-08).
  - As-Is (2026-11-07 answers): most customers use 出荷日; ベジロジ and オイシックス use 納品日. Sales are entered the evening of the shipping day by issuing the delivery note in FLAM. Returns/damage are new red slips dated when received; the original slip is not changed. V2 holds the sales slip date basis in 顧客マスタV2 (confirmed 2026-11-08).
  - Nasu FLAM sales codes switch by season/price period and nasu purchase codes switch when purchase prices change; the dates need not coincide. Strawberry keeps the same code. Treat V2 product IDs and FLAM sales/purchase codes as separate identifier systems; keep sales and purchase mappings separate; no shared validity period; do not apply nasu rules to strawberry. Never guess code lists or switch dates.

### Source of truth (V2, direction)

| Information | Source of truth |
|---|---|
| Planned orders (all customers), 産直出荷 shipped status | 統合受注管理V2 |
| Nasu shikiri results | なす仕切り管理V2 |
| Strawberry weekly targets, producer purchase targets | いちご製造計画V2 |
| Strawberry processing results, SF purchase confirmation | いちご受託加工管理V2 |
| 選果場出荷 actual shipment, 送り状番号, Lot, completion | 出荷管理V2 |
| SF-owned inventory movement history (official from S) | 在庫管理V2 |
| Producer weekly entries, allocation to SF 選果場 | 苺流通システム (external) |
| Product attributes and conversion rules | 商品マスタV2 |
| Monitor | Derived information |
| Sales management, revenue, aggregation | FLAM |

## Important

Files under local-data/ may contain operational data.
Do not commit local-data/ to Git.

Do not change established business rules solely for implementation convenience.

Do not change the existing production kintone apps unless explicitly instructed.
