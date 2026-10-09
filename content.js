(() => {
  // src/money.js
  function parseMoney(value) {
    const text = String(value).trim().replace(/^[¥￥]\s*/, "").replace(/\s*元$/, "").trim();
    if (!/^(?:\d+|\d{1,3}(?:,\d{3})+)(?:\.\d{1,2})?$/.test(text)) {
      throw new Error("\u91D1\u989D\u672A\u8BC6\u522B\uFF1A" + String(value));
    }
    const [whole, fraction = ""] = text.replaceAll(",", "").split(".");
    const cents = BigInt(whole) * 100n + BigInt(fraction.padEnd(2, "0"));
    if (cents > BigInt(Number.MAX_SAFE_INTEGER)) throw new Error("\u91D1\u989D\u8D85\u51FA\u5B89\u5168\u8303\u56F4");
    return Number(cents);
  }
  function formatMoney(cents) {
    if (!Number.isSafeInteger(cents) || cents < 0) throw new Error("\u91D1\u989D\u5FC5\u987B\u662F\u975E\u8D1F\u6574\u6570\u5206");
    const value = BigInt(cents);
    return `${value / 100n}.${String(value % 100n).padStart(2, "0")}`;
  }
  function parseTargetAmount(value) {
    const text = String(value).trim();
    if (!/^\d+(?:\.\d{1,2})?$/.test(text)) {
      throw new Error("请输入目标金额，至少 0.01 元，最多两位小数");
    }
    const cents = parseMoney(text);
    if (cents < 1) throw new Error("目标金额至少为 0.01 元");
    return cents;
  }
  function reductionFor(cents, targetCents = 1) {
    formatMoney(cents);
    formatMoney(targetCents);
    if (targetCents < 1) throw new Error("目标金额至少为 0.01 元");
    return cents >= targetCents ? cents - targetCents : null;
  }

  // src/async.js
  function checkAbort(signal) {
    if (signal?.aborted) throw new Error(typeof signal.reason === "string" ? signal.reason : "\u5DF2\u505C\u6B62\u64CD\u4F5C");
  }
  function delay(ms, signal) {
    checkAbort(signal);
    return new Promise((resolve, reject) => {
      const finish = () => {
        signal?.removeEventListener("abort", cancel);
        resolve();
      };
      const timer = setTimeout(finish, ms);
      const cancel = () => {
        clearTimeout(timer);
        signal.removeEventListener("abort", cancel);
        reject(new Error(typeof signal.reason === "string" ? signal.reason : "\u5DF2\u505C\u6B62\u64CD\u4F5C"));
      };
      signal?.addEventListener("abort", cancel, { once: true });
    });
  }

  // src/adapter.js
  var clean = (text) => String(text || "").replace(/\s+/g, " ").trim();
  var compact = (text) => clean(text).replace(/\s/g, "");
  var selectors = 'table,[role="table"],[role="grid"]';
  var rowSelectors = 'tr,[role="row"]';
  var cellSelectors = 'td,[role="cell"],[role="gridcell"]';
  var expectedHeaders = Object.freeze({
    name: ["\u5546\u54C1\u4FE1\u606F", "\u5546\u54C1\u540D\u79F0"],
    quantity: ["\u5355\u4EF7/\u6570\u91CF", "\u5355\u4EF7\u6570\u91CF", "\u6570\u91CF"],
    original: ["\u539F\u5546\u54C1\u5E94\u4ED8"],
    reduction: ["\u964D\u4EF7"],
    actual: ["\u6539\u540E\u5546\u54C1\u5E94\u4ED8"]
  });
  function visible(el) {
    if (!el?.isConnected) return false;
    for (let node = el; node?.nodeType === 1; node = node.parentElement) {
      if (node.hidden || node.hasAttribute("inert") || node.getAttribute("aria-hidden") === "true") return false;
      const style = getComputedStyle(node);
      if (style.display === "none" || style.visibility === "hidden" || style.visibility === "collapse" || style.contentVisibility === "hidden") return false;
    }
    return true;
  }
  function labelOf(control) {
    if (control.labels?.length) return compact([...control.labels].map((el) => el.textContent).join(""));
    if (control.getAttribute("aria-label")) return compact(control.getAttribute("aria-label"));
    const labelledBy = control.getAttribute("aria-labelledby");
    if (labelledBy) return compact(labelledBy.split(/\s+/).map((id) => control.ownerDocument.getElementById(id)?.textContent).join(""));
    const label = control.closest("label") || control.parentElement;
    if (label?.querySelectorAll('input[type="radio"],[role="radio"]').length === 1) return compact(label.textContent);
    return "";
  }
  function requireProductMode(root) {
    const controls = [...root.querySelectorAll('input[type="radio"],[role="radio"]')];
    const labelled = controls.filter((el) => visible(el) || visible(el.closest("label"))).map((el) => ({ el, text: labelOf(el), checked: el.matches("input") ? el.checked : el.getAttribute("aria-checked") === "true" }));
    const product = labelled.filter((x) => x.text === "\u5546\u54C1\u6539\u4EF7");
    const order = labelled.filter((x) => x.text === "\u8BA2\u5355\u6539\u4EF7");
    if (product.length !== 1 || order.length !== 1) throw new Error("\u672A\u8BC6\u522B\uFF1A\u65E0\u6CD5\u552F\u4E00\u786E\u8BA4\u5546\u54C1\u6539\u4EF7\u5355\u9009\u9879");
    if (!product[0].checked || order[0].checked) throw new Error("\u5DF2\u6682\u505C\uFF1A\u4EC5\u652F\u6301\u5546\u54C1\u6539\u4EF7\uFF0C\u8BF7\u624B\u52A8\u5207\u6362\u6A21\u5F0F\u540E\u91CD\u65B0\u626B\u63CF");
  }
  function hasModeLabels(root) {
    return [...root.querySelectorAll('input[type="radio"],[role="radio"]')].filter((el) => visible(el) || visible(el.closest("label"))).map(labelOf).some((text) => text === "\u5546\u54C1\u6539\u4EF7") && [...root.querySelectorAll('input[type="radio"],[role="radio"]')].filter((el) => visible(el) || visible(el.closest("label"))).map(labelOf).some((text) => text === "\u8BA2\u5355\u6539\u4EF7");
  }
  function findRoot(table) {
    let parent = table.parentElement;
    while (parent && !["BODY", "HTML"].includes(parent.tagName)) {
      if (visible(parent) && hasModeLabels(parent)) {
        const hasTitle = [...parent.querySelectorAll('h1,h2,h3,h4,header,span,div,[role="heading"]')].some((el) => visible(el) && compact(el.textContent) === "\u6539\u4EF7");
        if (hasTitle) return parent;
      }
      parent = parent.parentElement;
    }
    throw new Error("\u672A\u8BC6\u522B\uFF1A\u9875\u9762\u7ED3\u6784\u65E0\u6CD5\u8BC6\u522B\uFF0C\u672A\u627E\u5230\u5305\u542B\u6539\u4EF7\u6807\u9898\u548C\u6539\u4EF7\u65B9\u5F0F\u7684\u4FA7\u680F");
  }
  function schemaOf(table) {
    const headers = [...table.querySelectorAll(rowSelectors)].filter((row) => row.closest(selectors) === table).map((row) => [...row.querySelectorAll('th,[role="columnheader"]')].filter(visible)).filter((cells) => cells.length);
    const matches = [];
    for (const cells of headers) {
      const texts = cells.map((el) => compact(el.textContent).replace(/[?？ⓘ]/g, ""));
      const field = (names) => texts.map((text, i) => names.includes(text) ? i : -1).filter((i) => i >= 0);
      const entries = Object.fromEntries(Object.entries(expectedHeaders).map(([key, names]) => [key, field(names)]));
      if (Object.values(entries).every((values) => values.length === 1)) {
        matches.push({ columns: Object.fromEntries(Object.entries(entries).map(([key, values]) => [key, values[0]])), size: cells.length });
      }
    }
    const unique = new Map(matches.map((match) => [JSON.stringify(match), match]));
    return unique.size === 1 ? [...unique.values()][0] : null;
  }
  function rowCells(row) {
    return [...row.children].filter((el) => el.matches(cellSelectors));
  }
  function dataRows(table) {
    return [...table.querySelectorAll(rowSelectors)].filter((row) => row.closest(selectors) === table && !row.closest("thead,tfoot") && visible(row)).filter((row) => !row.querySelector('th,[role="columnheader"]') && rowCells(row).length).filter((row) => row.querySelector("input,button,select,textarea") || rowCells(row).some((cell) => clean(cell.textContent)));
  }
  function reductionInputs(cell) {
    const inputs = [...cell.querySelectorAll("input")].filter(visible);
    if (inputs.length !== 2 || inputs.some((el) => !["text", "number"].includes(el.type) || el.disabled || el.readOnly)) {
      throw new Error("\u672A\u8BC6\u522B\uFF1A\u964D\u4EF7\u533A\u57DF\u5FC5\u987B\u5305\u542B\u4E24\u4E2A\u53EF\u7528\u91D1\u989D\u8F93\u5165\u6846");
    }
    const tokenText = (node) => {
      if (node.nodeType === 3) return node.textContent;
      if (node.nodeType !== 1) return "";
      if (node.tagName === "INPUT") return `@${inputs.indexOf(node)}@`;
      if (!visible(node)) return "";
      return [...node.childNodes].map(tokenText).join("");
    };
    if (!/^@0@折[=＝]?减@1@元$/.test(compact(tokenText(cell)))) {
      throw new Error("\u672A\u8BC6\u522B\uFF1A\u65E0\u6CD5\u786E\u8BA4\u201C\u6298 = \u51CF \u91D1\u989D \u5143\u201D\u7684\u8F93\u5165\u6846\u5173\u7CFB");
    }
    return { discountInput: inputs[0], reductionInput: inputs[1] };
  }
  function quantityOf(cell) {
    const matches = [...clean(cell.textContent).matchAll(/(?:^|\s)[xX×]\s*(\d+)(?=\s|$)/g)];
    if (!matches.length) {
      const leaves = [...cell.querySelectorAll("*")].filter((el) => !el.children.length && visible(el));
      const quantities = leaves.map((el) => compact(el.textContent)).filter((text) => /^[xX×]\d+$/.test(text));
      if (quantities.length === 1) return Number(quantities[0].slice(1));
    }
    if (matches.length !== 1) throw new Error("\u672A\u8BC6\u522B\uFF1A\u6570\u91CF\u5FC5\u987B\u660E\u786E\u663E\u793A\u4E3A x1");
    return Number(matches[0][1]);
  }
  function rowOf(row, schema, index, targetCents = 1) {
    const cells = rowCells(row);
    const result = {
      key: `unrecognized-${index}`,
      name: "\u672A\u8BC6\u522B\u5546\u54C1",
      originalCents: null,
      reductionCents: null,
      expectedCents: targetCents,
      actualCents: null,
      quantity: null,
      status: "\u672A\u8BC6\u522B",
      detail: "",
      blocking: true,
      element: row
    };
    try {
      if (cells.length !== schema.size || cells.some((cell) => Number(cell.getAttribute("colspan") || 1) !== 1)) {
        throw new Error("\u672A\u8BC6\u522B\uFF1A\u5546\u54C1\u884C\u4E0E\u8868\u5934\u5217\u6570\u4E0D\u4E00\u81F4");
      }
      const at = (key) => cells[schema.columns[key]];
      result.name = clean(at("name").innerText || at("name").textContent);
      if (!result.name) throw new Error("\u672A\u8BC6\u522B\uFF1A\u5546\u54C1\u540D\u79F0\u4E3A\u7A7A");
      result.originalCents = parseMoney(at("original").textContent);
      result.actualCents = parseMoney(at("actual").textContent);
      result.quantity = quantityOf(at("quantity"));
      Object.assign(result, reductionInputs(at("reduction")));
      result.inputValue = result.reductionInput.value;
      if (result.inputValue.trim()) parseMoney(result.inputValue);
      result.stableId = ["data-row-key", "data-sku-id", "data-sku", "data-item-id"].map((attr) => row.getAttribute(attr)).find(Boolean) || null;
      result.fingerprint = JSON.stringify([result.name, result.originalCents, result.quantity]);
      result.key = result.stableId ? `id:${result.stableId}` : `product:${result.fingerprint}`;
      if (result.quantity !== 1) {
        result.reductionCents = null;
        result.status = "\u9700\u786E\u8BA4";
        result.detail = `\u6570\u91CF\u4E3A ${result.quantity}\uFF0C\u5DF2\u6682\u505C\u6574\u6279\u64CD\u4F5C\u3002\u8BF7\u5148\u786E\u8BA4\u5206\u644A\u65B9\u5F0F\u5E76\u624B\u52A8\u5904\u7406\uFF0C\u518D\u91CD\u65B0\u626B\u63CF\u3002`;
      } else if (targetCents === null) {
        result.blocking = false;
        result.status = "可恢复";
        result.detail = "仅检查商品身份和输入框关系";
      } else if ((result.reductionCents = reductionFor(result.originalCents, targetCents)) === null) {
        result.status = "需确认";
        result.detail = `目标金额 ${formatMoney(targetCents)} 元高于原商品应付 ${formatMoney(result.originalCents)} 元，已暂停整批操作；请降低目标金额后重新扫描。`;
      } else {
        result.blocking = false;
        result.status = "\u53EF\u4FEE\u6539";
        result.detail = "\u4EC5\u586B\u5199\u51CF\u4EF7\uFF0C\u4E0D\u63D0\u4EA4";
      }
    } catch (error) {
      result.detail = error.message;
    }
    return result;
  }
  function commonAncestor(left, right) {
    const rightAncestors = /* @__PURE__ */ new Set();
    for (let node = right; node; node = node.parentElement) rightAncestors.add(node);
    for (let node = left; node; node = node.parentElement) if (rightAncestors.has(node)) return node;
    return null;
  }
  function hasRowGroup(table) {
    return Boolean(table.querySelector(':scope > tbody,:scope > [role="rowgroup"]'));
  }
  function declaredColumns(table) {
    const ariaCount = Number(table.getAttribute("aria-colcount"));
    if (Number.isInteger(ariaCount) && ariaCount > 0) return ariaCount;
    const columns = [...table.children].find((el) => el.tagName === "COLGROUP")?.querySelectorAll("col").length || 0;
    return columns || null;
  }
  function loadingState(root) {
    if ([...root.querySelectorAll('[aria-busy="true"],[role="progressbar"]')].some(visible)) return true;
    return [...root.querySelectorAll('div,span,p,[role="status"]')].some((el) => visible(el) && /^(商品列表)?(商品)?(正在)?加载中[。.．…]*$/.test(compact(el.textContent)));
  }
  function findScrollContainer(bodyTable, root) {
    for (let node = bodyTable.parentElement; node && root.contains(node); node = node.parentElement) {
      const style = getComputedStyle(node);
      if (/(auto|scroll)/.test(`${style.overflowY} ${style.overflow}`) && node.clientHeight > 0) return node;
    }
    return null;
  }
  function identifyPair(root, schemaTables, tables) {
    const { table: headerTable, schema } = schemaTables[0];
    const entries = tables.map((table) => ({ table, rows: dataRows(table) }));
    const structuralError = (detail) => new Error(`\u672A\u8BC6\u522B\uFF1A\u9875\u9762\u7ED3\u6784\u65E0\u6CD5\u8BC6\u522B\uFF0C${detail}\u3002\u53EF\u590D\u5236\u8BC6\u522B\u8BCA\u65AD\u3002`);
    const componentOf = (bodyTable) => {
      const component = commonAncestor(headerTable, bodyTable);
      if (!component || !root.contains(component) || component === root || hasModeLabels(component)) return null;
      const headers = schemaTables.filter((entry) => component === entry.table || component.contains(entry.table));
      return headers.length === 1 && headers[0].table === headerTable ? component : null;
    };
    const bodyCandidates = entries.filter((entry) => entry.rows.length || entry.table !== headerTable && hasRowGroup(entry.table) && declaredColumns(entry.table) === schema.size);
    const pairs = bodyCandidates.map((body) => ({ ...body, schema, component: componentOf(body.table) })).filter((pair) => pair.component);
    if (pairs.length > 1) throw structuralError(`\u8868\u5934\u4E0E\u5546\u54C1\u8868\u4F53\u65E0\u6CD5\u552F\u4E00\u914D\u5BF9\uFF08\u5019\u9009 ${pairs.length} \u7EC4\uFF09`);
    if (pairs.length === 1) {
      const pair = pairs[0];
      const columns = declaredColumns(pair.table);
      if (columns !== null && columns !== schema.size) throw structuralError("\u5546\u54C1\u8868\u4F53\u58F0\u660E\u5217\u6570\u4E0E\u8868\u5934\u4E0D\u4E00\u81F4");
      return pair;
    }
    if (bodyCandidates.length) throw structuralError("\u8868\u5934\u548C\u5546\u54C1\u8868\u4F53\u4E0D\u5728\u53EF\u786E\u8BA4\u7684\u5171\u540C\u8868\u683C\u7EC4\u4EF6\u5185");
    if (hasRowGroup(headerTable)) return { table: headerTable, rows: [], schema, component: headerTable };
    if (loadingState(root)) throw new Error("\u5546\u54C1\u672A\u52A0\u8F7D\uFF1A\u5546\u54C1\u5217\u8868\u4ECD\u5728\u52A0\u8F7D\uFF0C\u5B8C\u6210\u540E\u8BF7\u91CD\u65B0\u626B\u63CF\u3002");
    throw structuralError("\u672A\u627E\u5230\u4E0E\u5546\u54C1\u8868\u5934\u5BF9\u5E94\u7684\u5546\u54C1\u8868\u4F53");
  }
  function inspect(doc = document, targetCents = 1) {
    const tables = [...doc.querySelectorAll(selectors)].filter(visible);
    const schemas = tables.map((table) => ({ table, schema: schemaOf(table) })).filter((entry) => entry.schema);
    if (!schemas.length) throw new Error("\u672A\u8BC6\u522B\uFF1A\u9875\u9762\u7ED3\u6784\u65E0\u6CD5\u8BC6\u522B\uFF0C\u672A\u627E\u5230\u5B8C\u6574\u4E14\u53EF\u89C1\u7684\u5546\u54C1\u6539\u4EF7\u8868\u5934\u3002\u53EF\u590D\u5236\u8BC6\u522B\u8BCA\u65AD\u3002");
    const roots = /* @__PURE__ */ new Map();
    for (const entry of schemas) {
      try {
        const root2 = findRoot(entry.table);
        if (!roots.has(root2)) roots.set(root2, []);
        roots.get(root2).push(entry);
      } catch {
      }
    }
    if (roots.size !== 1) throw new Error(`\u672A\u8BC6\u522B\uFF1A\u9875\u9762\u7ED3\u6784\u65E0\u6CD5\u8BC6\u522B\uFF0C\u627E\u5230 ${roots.size} \u4E2A\u5305\u542B\u6539\u4EF7\u8868\u5934\u7684\u6539\u4EF7\u4FA7\u680F\u5019\u9009\u3002\u53EF\u590D\u5236\u8BC6\u522B\u8BCA\u65AD\u3002`);
    const [[root, schemaTables]] = roots;
    requireProductMode(root);
    if (schemaTables.length !== 1) throw new Error(`\u672A\u8BC6\u522B\uFF1A\u9875\u9762\u7ED3\u6784\u65E0\u6CD5\u8BC6\u522B\uFF0C\u6539\u4EF7\u4FA7\u680F\u5185\u6709 ${schemaTables.length} \u4E2A\u53EF\u89C1\u5546\u54C1\u8868\u5934\uFF0C\u65E0\u6CD5\u552F\u4E00\u786E\u5B9A\u5217\u5B9A\u4E49\u3002\u53EF\u590D\u5236\u8BC6\u522B\u8BCA\u65AD\u3002`);
    const scopedTables = tables.filter((table) => root.contains(table));
    const pair = identifyPair(root, schemaTables, scopedTables);
    const schema = pair.schema || schemaTables[0].schema;
    const rows = pair.rows.map((row, i) => rowOf(row, schema, i, targetCents));
    if (!rows.length) throw new Error("\u5546\u54C1\u672A\u52A0\u8F7D\uFF1A\u5DF2\u8BC6\u522B\u5546\u54C1\u8868\u4F53\uFF0C\u4F46\u5F53\u524D\u5C1A\u65E0\u5546\u54C1\u884C\uFF0C\u8BF7\u7A0D\u540E\u626B\u63CF\u3002");
    const keys = /* @__PURE__ */ new Set();
    for (const row of rows) {
      if (keys.has(row.key)) throw new Error("\u672A\u8BC6\u522B\uFF1A\u5546\u54C1\u8EAB\u4EFD\u91CD\u590D\uFF0C\u65E0\u6CD5\u5B89\u5168\u533A\u5206\u5BF9\u5E94\u8F93\u5165\u6846");
      keys.add(row.key);
    }
    const orderIds = [...root.querySelectorAll("[data-order-id]")].map((el) => el.getAttribute("data-order-id"));
    orderIds.unshift(root.getAttribute("data-order-id") || "");
    const orderText = clean(root.innerText).match(/订单(?:编号|号)\s*[:：]\s*([\w-]+)/)?.[1] || "";
    const orderContext = JSON.stringify([orderText, orderIds.filter(Boolean)]);
    const scrollContainer = findScrollContainer(pair.table, root);
    return { root, bodyTable: pair.table, tableComponent: pair.component, schema, rows, orderContext, scrollContainer };
  }
  function collectDiagnostics(doc = document) {
    const allTables = [...doc.querySelectorAll(selectors)];
    const safeCount = (value) => /^\d+$/.test(value || "") && Number.isSafeInteger(Number(value)) ? Number(value) : null;
    const summarize = (table) => {
      const rows = [...table.querySelectorAll(rowSelectors)].filter((row) => row.closest(selectors) === table);
      const headers = rows.filter((row) => row.querySelector('th,[role="columnheader"]'));
      const cellsPerRow = rows.map((row) => rowCells(row).length).filter(Boolean);
      const visibleRows = rows.filter(visible);
      const inputs = [...table.querySelectorAll("input")];
      const style = getComputedStyle(table);
      let scroll = null;
      for (let node = table.parentElement; node; node = node.parentElement) {
        const css = getComputedStyle(node);
        if (/(auto|scroll)/.test(`${css.overflowY} ${css.overflow}`)) {
          scroll = { overflowY: css.overflowY, clientHeight: node.clientHeight, scrollHeight: node.scrollHeight, scrollTop: node.scrollTop };
          break;
        }
      }
      const safeHeaders = [...new Set(headers.flatMap((row) => [...row.querySelectorAll('th,[role="columnheader"]')].map((cell) => compact(cell.textContent).replace(/[?？ⓘ]/g, ""))))].map((label) => Object.values(expectedHeaders).flat().includes(label) ? label : "[\u5176\u4ED6\u5217]");
      return {
        tag: table.tagName.toLowerCase(),
        role: ["table", "grid"].includes(table.getAttribute("role")) ? table.getAttribute("role") : "",
        visible: visible(table),
        display: style.display,
        hasDisplayContentsAncestor: [...(function* () {
          for (let node = table.parentElement; node; node = node.parentElement) yield node;
        })()].some((node) => getComputedStyle(node).display === "contents"),
        headerRowCount: headers.length,
        headerLabels: safeHeaders,
        rowElementCount: rows.length,
        visibleRowCount: visibleRows.length,
        cellCounts: [...new Set(cellsPerRow)].sort((a, b) => a - b),
        inputCount: inputs.length,
        reductionLikeInputCellCount: rows.filter((row) => rowCells(row).some((cell) => cell.querySelectorAll("input").length === 2)).length,
        ariaRowCount: safeCount(table.getAttribute("aria-rowcount")),
        ariaColumnCount: safeCount(table.getAttribute("aria-colcount")),
        busy: table.getAttribute("aria-busy") === "true",
        scroll
      };
    };
    const visibleTables = allTables.filter(visible);
    const modes = [...doc.querySelectorAll('input[type="radio"],[role="radio"]')].filter((el) => ["\u5546\u54C1\u6539\u4EF7", "\u8BA2\u5355\u6539\u4EF7"].includes(labelOf(el)) && (visible(el) || visible(el.closest("label")))).map((el) => ({ mode: labelOf(el), checked: el.matches("input") ? el.checked : el.getAttribute("aria-checked") === "true" }));
    const busyCount = [...doc.querySelectorAll('[aria-busy="true"],[role="progressbar"]')].filter(visible).length;
    return {
      diagnosticVersion: 1,
      scope: "\u53EA\u8BFB DOM \u7ED3\u6784\u8BA1\u6570\uFF1B\u672A\u91C7\u96C6\u9875\u9762\u91D1\u989D\u3001\u5546\u54C1\u540D\u79F0\u3001\u8D26\u53F7\u3001\u8BA2\u5355\u53F7\u3001\u5BA2\u6237\u8D44\u6599\u3001\u8F93\u5165\u503C\u6216\u767B\u5F55\u51ED\u8BC1\u3002",
      tableCount: allTables.length,
      visibleTableCount: visibleTables.length,
      matchingHeaderTableCount: visibleTables.filter((table) => schemaOf(table)).length,
      busyIndicatorCount: busyCount,
      modes,
      tables: allTables.map(summarize)
    };
  }
  function sameContext(a, b) {
    return a.root === b.root && a.bodyTable === b.bodyTable && a.tableComponent === b.tableComponent && a.scrollContainer === b.scrollContainer && a.orderContext === b.orderContext;
  }
  function setReduction(row, value) {
    const input = row.reductionInput;
    if (!visible(input) || input.disabled || input.readOnly || !row.element.contains(input)) {
      throw new Error("\u672A\u8BC6\u522B\uFF1A\u51CF\u4EF7\u8F93\u5165\u6846\u5DF2\u66FF\u6362\uFF0C\u8BF7\u91CD\u65B0\u626B\u63CF");
    }
    const win = input.ownerDocument.defaultView;
    const setter = Object.getOwnPropertyDescriptor(win.HTMLInputElement.prototype, "value").set;
    input.focus({ preventScroll: true });
    setter.call(input, value);
    input.dispatchEvent(new win.Event("input", { bubbles: true, composed: true }));
    input.dispatchEvent(new win.Event("change", { bubbles: true, composed: true }));
    if (input.ownerDocument.activeElement === input) input.blur();
    else {
      input.dispatchEvent(new win.FocusEvent("blur", { bubbles: false, composed: true }));
      input.dispatchEvent(new win.FocusEvent("focusout", { bubbles: true, composed: true }));
    }
  }
  async function collectRows({ doc = document, targetCents = 1, signal, guard = () => {
  }, onProgress = () => {
  } }) {
    let context = inspect(doc, targetCents);
    const scroll = context.scrollContainer;
    const previousTop = scroll?.scrollTop || 0;
    const found = /* @__PURE__ */ new Map();
    let recycled = false;
    let lastKeys = /* @__PURE__ */ new Set();
    let stableBottom = 0;
    let oldHeight = 0;
    const assertContext = (fresh) => {
      checkAbort(signal);
      guard(fresh);
      if (!sameContext(context, fresh)) throw new Error("\u5DF2\u505C\u6B62\uFF1A\u6539\u4EF7\u7A97\u53E3\u6216\u8BA2\u5355\u4E0A\u4E0B\u6587\u5DF2\u53D8\u5316");
    };
    const read = () => {
      const fresh = inspect(doc, targetCents);
      assertContext(fresh);
      const keys = new Set(fresh.rows.map((row) => row.key));
      if ([...lastKeys].some((key) => !keys.has(key))) recycled = true;
      for (const row of fresh.rows) {
        const previous = found.get(row.key);
        if (previous && previous.fingerprint !== row.fingerprint) throw new Error("\u672A\u8BC6\u522B\uFF1A\u626B\u63CF\u4E2D\u5546\u54C1\u8EAB\u4EFD\u6216\u539F\u91D1\u989D\u53D1\u751F\u53D8\u5316");
        found.set(row.key, { ...row, scrollTop: scroll?.scrollTop || 0 });
      }
      lastKeys = keys;
      onProgress([...found.values()]);
      return fresh;
    };
    try {
      if (scroll) {
        scroll.scrollTop = 0;
        await delay(180, signal);
      }
      for (let step = 0; step < 200; step++) {
        context = read();
        const more = [...context.root.querySelectorAll('button,a,[role="button"]')].some((el) => visible(el) && /^(加载更多|查看更多商品|查看更多)$/.test(compact(el.textContent)));
        if (more) throw new Error("\u672A\u8BC6\u522B\uFF1A\u8BF7\u5148\u624B\u52A8\u5C55\u5F00\u5168\u90E8\u5546\u54C1\uFF0C\u518D\u91CD\u65B0\u626B\u63CF");
        if (!scroll) break;
        const busy = [...context.root.querySelectorAll('[aria-busy="true"],[role="progressbar"]')].some(visible);
        const bottom = scroll.scrollTop + scroll.clientHeight >= scroll.scrollHeight - 2;
        if (bottom && !busy && scroll.scrollHeight === oldHeight) stableBottom++;
        else stableBottom = 0;
        oldHeight = scroll.scrollHeight;
        if (stableBottom >= 2) break;
        if (step === 199) throw new Error("\u672A\u8BC6\u522B\uFF1A\u6EDA\u52A8\u52A0\u8F7D\u672A\u7A33\u5B9A\uFF0C\u8BF7\u5148\u624B\u52A8\u52A0\u8F7D\u5168\u90E8\u5546\u54C1");
        if (!bottom) scroll.scrollTop = Math.min(scroll.scrollTop + Math.max(1, scroll.clientHeight * 0.7), scroll.scrollHeight);
        await delay(bottom || busy ? 600 : 180, signal);
      }
      if (recycled) {
        const rawCount = Number(context.bodyTable.getAttribute("aria-rowcount"));
        const localHeaders = [...context.bodyTable.querySelectorAll(rowSelectors)].filter((row) => row.closest(selectors) === context.bodyTable && row.querySelector('th,[role="columnheader"]')).length;
        const total = Number.isInteger(rawCount) && rawCount > 0 ? rawCount - localHeaders : NaN;
        if (![...found.values()].every((row) => row.stableId) || total !== found.size) {
          throw new Error("\u672A\u8BC6\u522B\uFF1A\u865A\u62DF\u5217\u8868\u7F3A\u5C11\u552F\u4E00\u5546\u54C1\u6807\u8BC6\u6216\u660E\u786E\u603B\u884C\u6570\uFF0C\u8BF7\u5148\u5C55\u5F00\u5B8C\u6574\u5217\u8868");
        }
      }
      if ([...context.root.querySelectorAll('[aria-busy="true"],[role="progressbar"]')].some(visible)) {
        throw new Error("\u5546\u54C1\u672A\u52A0\u8F7D\uFF1A\u9875\u9762\u4ECD\u5728\u52A0\u8F7D\uFF0C\u8BF7\u7A0D\u540E\u626B\u63CF\u3002");
      }
      return { context, rows: [...found.values()] };
    } finally {
      if (scroll?.isConnected && !signal?.aborted) scroll.scrollTop = previousTop;
    }
  }

  // src/policy.js
  function isAllowedUrl(url) {
    try {
      const authority = String(url).match(/^[a-z][a-z\d+.-]*:\/\/([^/?#]+)/i)?.[1] || "";
      const parsed = new URL(url);
      const explicitPort = authority.includes("@") ? authority.split("@").pop().includes(":") : authority.includes(":");
      return parsed.protocol === "https:" && parsed.port === "" && !explicitPort && !parsed.username && !parsed.password && ["shop.jd.com", "jdm.jd.com"].includes(parsed.hostname) && /^\/jdm\/trade\/orders\/order-list\/?$/.test(parsed.pathname);
    } catch {
      return false;
    }
  }

  // src/controller.js
  var MAX_ATTEMPTS = 2;
  var WAIT_TIMEOUT_MS = 2400;
  function publicRow(row) {
    return {
      key: row.key,
      name: row.name,
      originalCents: Number.isSafeInteger(row.originalCents) ? row.originalCents : null,
      reductionCents: Number.isSafeInteger(row.reductionCents) ? row.reductionCents : null,
      expectedCents: Number.isSafeInteger(row.expectedCents) ? row.expectedCents : null,
      actualCents: Number.isSafeInteger(row.actualCents) ? row.actualCents : null,
      status: row.status || "\u672A\u8BC6\u522B",
      detail: row.detail || ""
    };
  }
  function cloneState(state) {
    return { ...state, rows: state.rows.map(publicRow) };
  }
  function samePage(a, b) {
    try {
      const left = new URL(a);
      const right = new URL(b);
      return left.origin === right.origin && left.pathname === right.pathname && left.search === right.search;
    } catch {
      return false;
    }
  }
  function createController(doc = document, { allowLocalTest = false } = {}) {
    const listeners = /* @__PURE__ */ new Set();
    const modifications = /* @__PURE__ */ new Map();
    let state = {
      phase: "idle",
      message: "\u8BF7\u5148\u6253\u5F00\u4EAC\u9EA6\u7684\u5546\u54C1\u6539\u4EF7\u4FA7\u680F\uFF0C\u518D\u626B\u63CF\u5F53\u524D\u7A97\u53E3\u3002",
      rows: [],
      busy: false,
      canApply: false,
      canRestore: false,
      targetCents: 1,
      targetInput: "0.01",
      targetError: ""
    };
    let active = null;
    let previewTargetCents = null;
    let lastUrl = doc.defaultView?.location.href || "";
    const publish = (patch) => {
      state = { ...state, ...patch };
      const snapshot = cloneState(state);
      for (const listener of listeners) listener(snapshot);
    };
    const setRows = (rows) => {
      const blocking = rows.some((row) => row.blocking);
      const eligible = rows.some((row) => row.status === "\u53EF\u4FEE\u6539");
      publish({ rows, canApply: eligible && !blocking, canRestore: modifications.size > 0 });
    };
    function setTargetAmount(value) {
      if (active) {
        publish({ message: "操作进行中，目标金额不能修改；请等待完成或先停止。" });
        return cloneState(state);
      }
      const targetInput = String(value);
      let targetCents = null;
      let targetError = "";
      try {
        targetCents = parseTargetAmount(targetInput);
      } catch (error) {
        targetError = error instanceof Error ? error.message : String(error);
      }
      const changed = targetCents !== state.targetCents;
      if (targetError || changed) {
        previewTargetCents = null;
        publish({
          targetInput,
          targetCents,
          targetError,
          rows: [],
          canApply: false,
          canRestore: modifications.size > 0,
          phase: targetError ? "error" : "idle",
          message: targetError ? `目标金额无效：${targetError}` : `目标金额已改为 ${formatMoney(targetCents)} 元，请重新扫描当前改价窗口。`
        });
      } else {
        publish({ targetInput, targetCents, targetError });
      }
      return cloneState(state);
    }
    function operationTarget() {
      if (!Number.isSafeInteger(state.targetCents) || state.targetCents < 1 || state.targetError) {
        previewTargetCents = null;
        publish({ phase: "error", message: `目标金额无效：${state.targetError || "请输入至少 0.01 元、最多两位小数的金额"}`, rows: [], canApply: false, canRestore: modifications.size > 0 });
        return null;
      }
      return state.targetCents;
    }
    const ensureRunningPage = () => {
      const url = doc.defaultView?.location.href || "";
      const parsed = new URL(url);
      if (!isAllowedUrl(url) && !(allowLocalTest && parsed.hostname === "127.0.0.1" && parsed.port === "4173")) {
        throw new Error("\u5F53\u524D\u9875\u9762\u4E0D\u5728\u4EAC\u4E1C/\u4EAC\u9EA6\u767D\u540D\u5355\u5185");
      }
      if (lastUrl && !samePage(lastUrl, url)) throw new Error("\u9875\u9762\u8BA2\u5355\u4E0A\u4E0B\u6587\u5DF2\u53D8\u5316\uFF0C\u64CD\u4F5C\u5DF2\u505C\u6B62\uFF0C\u8BF7\u91CD\u65B0\u626B\u63CF");
      lastUrl = url;
    };
    const begin = (phase, message) => {
      if (active) throw new Error("\u5DF2\u6709\u64CD\u4F5C\u6B63\u5728\u8FDB\u884C\uFF0C\u8BF7\u5148\u505C\u6B62");
      active = new AbortController();
      publish({ phase, message, busy: true });
      return active;
    };
    const finish = (run, patch = {}) => {
      if (active !== run) return;
      active = null;
      publish({ busy: false, ...patch, canRestore: modifications.size > 0 });
    };
    const stopInternal = (message = "\u5DF2\u505C\u6B62\uFF0C\u672A\u5B8C\u6210\u7684\u884C\u4E0D\u4F1A\u7EE7\u7EED\u64CD\u4F5C\u3002") => {
      if (active) {
        active.abort(message);
        active = null;
      }
      publish({ phase: "stopped", message, busy: false, canApply: false, canRestore: modifications.size > 0 });
    };
    async function readAll(signal, progressMessage, targetCents) {
      ensureRunningPage();
      const firstUrl = lastUrl;
      const result = await collectRows({
        doc,
        targetCents,
        signal,
        guard: () => {
          ensureRunningPage();
          if (!samePage(firstUrl, doc.defaultView?.location.href || "")) throw new Error("\u8BA2\u5355\u4E0A\u4E0B\u6587\u5DF2\u53D8\u5316\uFF0C\u5DF2\u505C\u6B62");
        },
        onProgress: (rows) => publish({ message: `${progressMessage}\uFF08\u5DF2\u8BFB\u53D6 ${rows.length} \u884C\uFF09`, rows })
      });
      setRows(result.rows);
      return result;
    }
    function blockingReason(rows) {
      const blockers = rows.filter((row) => row.blocking);
      return blockers.length ? blockers.map((row) => `${row.name}\uFF1A${row.detail || "\u672A\u8BC6\u522B"}`).join("\uFF1B") : "";
    }
    async function findFreshRow(key, expectedContext, targetScroll, signal, expectedFingerprint, targetCents) {
      checkAbort(signal);
      ensureRunningPage();
      let current = inspect(doc, targetCents);
      if (!sameContext(expectedContext, current)) throw new Error("\u6539\u4EF7\u7A97\u53E3\u6216\u8BA2\u5355\u4E0A\u4E0B\u6587\u5DF2\u53D8\u5316\uFF0C\u5DF2\u505C\u6B62");
      let row = current.rows.find((candidate) => candidate.key === key);
      if (!row && current.scrollContainer && Number.isFinite(targetScroll)) {
        current.scrollContainer.scrollTop = targetScroll;
        await delay(180, signal);
        current = inspect(doc, targetCents);
        if (!sameContext(expectedContext, current)) throw new Error("\u6539\u4EF7\u7A97\u53E3\u6216\u8BA2\u5355\u4E0A\u4E0B\u6587\u5DF2\u53D8\u5316\uFF0C\u5DF2\u505C\u6B62");
        row = current.rows.find((candidate) => candidate.key === key);
      }
      if (!row) throw new Error("\u672A\u8BC6\u522B\uFF1A\u76EE\u6807\u5546\u54C1\u884C\u5DF2\u79BB\u5F00\u9875\u9762\u4E14\u65E0\u6CD5\u5B89\u5168\u91CD\u65B0\u5B9A\u4F4D");
      if (row.blocking || row.fingerprint !== expectedFingerprint) {
        throw new Error("\u672A\u8BC6\u522B\uFF1A\u76EE\u6807\u5546\u54C1\u8EAB\u4EFD\u3001\u91D1\u989D\u3001\u6570\u91CF\u6216\u8F93\u5165\u6846\u5173\u7CFB\u5DF2\u53D8\u5316\uFF0C\u5DF2\u505C\u6B62");
      }
      return { context: current, row };
    }
    async function waitForAmount(key, expectedContext, targetScroll, signal, expectedFingerprint, targetCents) {
      const deadline = Date.now() + WAIT_TIMEOUT_MS;
      let last = null;
      while (Date.now() < deadline) {
        checkAbort(signal);
        const found = await findFreshRow(key, expectedContext, targetScroll, signal, expectedFingerprint, targetCents);
        last = found.row;
        if (found.row.actualCents === targetCents) return found;
        await delay(120, signal);
      }
      return { context: expectedContext, row: last };
    }
    async function scan() {
      const targetCents = operationTarget();
      if (targetCents === null) return cloneState(state);
      previewTargetCents = null;
      const run = begin("scanning", "\u6B63\u5728\u626B\u63CF\u5546\u54C1\u6539\u4EF7\u7A97\u53E3\u2026");
      publish({ canApply: false, rows: [] });
      try {
        const result = await readAll(run.signal, "\u6B63\u5728\u626B\u63CF\u5546\u54C1\u6539\u4EF7\u7A97\u53E3", targetCents);
        const blocker = blockingReason(result.rows);
        if (blocker) {
          finish(run, { phase: "error", message: `\u5DF2\u6682\u505C\uFF1A${blocker}`, canApply: false });
        } else if (result.rows.some((row) => row.status === "\u53EF\u4FEE\u6539")) {
          previewTargetCents = targetCents;
          finish(run, { phase: "ready", message: `扫描完成：目标为每行改后商品应付 ${formatMoney(targetCents)} 元。请确认预览后点击“自动填写减价（应用修改）”。` });
        } else {
          finish(run, { phase: "ready", message: "\u626B\u63CF\u5B8C\u6210\uFF1A\u6CA1\u6709\u9700\u8981\u586B\u5199\u7684\u5546\u54C1\u884C\u3002" });
        }
        return cloneState(state);
      } catch (error) {
        if (run.signal.aborted) finish(run, { phase: "stopped", message: String(run.signal.reason || "\u5DF2\u505C\u6B62\u64CD\u4F5C"), canApply: false });
        else finish(run, { phase: "error", message: error instanceof Error ? error.message : String(error), canApply: false });
        throw error;
      }
    }
    async function apply() {
      const targetCents = operationTarget();
      if (targetCents === null) return cloneState(state);
      if (!state.canApply || previewTargetCents !== targetCents) {
        publish({ phase: "error", message: "请先扫描当前目标金额并确认预览，再应用修改。", canApply: false });
        return cloneState(state);
      }
      const run = begin("applying", "\u6B63\u5728\u51C6\u5907\u586B\u5199\u51CF\u4EF7\u8F93\u5165\u6846\u2026");
      try {
        const result = await readAll(run.signal, "\u6B63\u5728\u786E\u8BA4\u9875\u9762\u884C", targetCents);
        const blocker = blockingReason(result.rows);
        if (blocker) throw new Error(`\u5DF2\u6682\u505C\uFF0C\u672A\u586B\u5199\u4EFB\u4F55\u884C\uFF1A${blocker}`);
        const targets = result.rows.filter((row) => row.status === "\u53EF\u4FEE\u6539" && row.reductionCents !== null);
        if (!targets.length) {
          finish(run, { phase: "complete", message: "没有需要填写的商品行。", canApply: false });
          return cloneState(state);
        }
        for (const originalRow of targets) {
          checkAbort(run.signal);
          const expectedText = formatMoney(originalRow.reductionCents);
          const before = originalRow.inputValue ?? originalRow.reductionInput?.value ?? "";
          let verified = false;
          let latest = originalRow;
          for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
            publish({ phase: "applying", message: `\u6B63\u5728\u586B\u5199 ${originalRow.name}\uFF08\u7B2C ${attempt}/${MAX_ATTEMPTS} \u6B21\u6821\u9A8C\uFF09` });
            const fresh = await findFreshRow(originalRow.key, result.context, originalRow.scrollTop, run.signal, originalRow.fingerprint, targetCents);
            latest = fresh.row;
            if (latest.quantity !== 1 || latest.reductionCents !== originalRow.reductionCents) {
              throw new Error(`${originalRow.name}\uFF1A\u9875\u9762\u91D1\u989D\u6216\u6570\u91CF\u53D1\u751F\u53D8\u5316\uFF0C\u5DF2\u505C\u6B62`);
            }
            const currentBefore = latest.reductionInput.value;
            const previousModification = modifications.get(originalRow.key);
            if (previousModification && (!sameContext(previousModification.context, fresh.context) || previousModification.fingerprint !== latest.fingerprint)) {
              throw new Error("\u5DF2\u505C\u6B62\uFF1A\u5DF2\u6709\u4FEE\u6539\u8BB0\u5F55\u5C5E\u4E8E\u53E6\u4E00\u5546\u54C1\u6216\u6539\u4EF7\u7A97\u53E3\uFF0C\u8BF7\u5148\u6062\u590D\u539F\u7A97\u53E3\u6216\u5237\u65B0\u9875\u9762");
            }
            if (!modifications.has(originalRow.key)) modifications.set(originalRow.key, {
              key: originalRow.key,
              before: currentBefore !== void 0 ? currentBefore : before,
              after: expectedText,
              name: originalRow.name,
              context: fresh.context,
              fingerprint: originalRow.fingerprint,
              scrollTop: originalRow.scrollTop
            });
            else previousModification.after = expectedText;
            setReduction(latest, expectedText);
            publish({ phase: "verifying", message: `\u6B63\u5728\u7B49\u5F85 ${originalRow.name} \u91CD\u65B0\u8BA1\u7B97\u2026` });
            const checked = await waitForAmount(originalRow.key, result.context, originalRow.scrollTop, run.signal, originalRow.fingerprint, targetCents);
            latest = checked.row;
            if (latest.actualCents === targetCents) {
              verified = true;
              break;
            }
          }
          if (!verified) {
            const detail = latest?.actualCents === null || latest?.actualCents === void 0 ? "\u672A\u8BC6\u522B" : `${formatMoney(latest.actualCents)} \u5143`;
            throw new Error(`${originalRow.name}\uFF1A\u6539\u540E\u5546\u54C1\u5E94\u4ED8\u4ECD\u4E3A ${detail}\uFF0C\u5DF2\u8FBE\u5230\u6700\u591A 2 \u6B21\u5C1D\u8BD5\uFF0C\u64CD\u4F5C\u505C\u6B62`);
          }
          const nextRows = state.rows.map((row) => row.key === originalRow.key ? { ...row, actualCents: targetCents, status: "\u6821\u9A8C\u901A\u8FC7", detail: "\u5DF2\u586B\u5199\u51CF\u4EF7\uFF0C\u672A\u63D0\u4EA4\u8BA2\u5355" } : row);
          publish({ rows: nextRows, message: `${originalRow.name} 已校验为 ${formatMoney(targetCents)} 元` });
        }
        finish(run, { phase: "complete", message: `应用修改完成：${targets.length} 行已填写并校验为 ${formatMoney(targetCents)} 元；未点击确定改价。`, canApply: false });
        return cloneState(state);
      } catch (error) {
        if (run.signal.aborted) finish(run, { phase: "stopped", message: String(run.signal.reason || "\u5DF2\u505C\u6B62\u64CD\u4F5C"), canApply: false });
        else finish(run, { phase: "error", message: error instanceof Error ? error.message : String(error), canApply: false });
        throw error;
      }
    }
    async function verify() {
      const targetCents = operationTarget();
      if (targetCents === null) return cloneState(state);
      const run = begin("verifying", "\u6B63\u5728\u8BFB\u53D6\u6539\u540E\u5546\u54C1\u5E94\u4ED8\u2026");
      try {
        const result = await readAll(run.signal, "\u6B63\u5728\u6821\u9A8C\u6539\u540E\u91D1\u989D", targetCents);
        const blocker = blockingReason(result.rows);
        if (blocker) throw new Error(`\u5DF2\u6682\u505C\uFF1A${blocker}`);
        const rows = result.rows.map((row) => {
          if (row.actualCents === targetCents) return { ...row, status: "\u6821\u9A8C\u901A\u8FC7", detail: `改后商品应付为 ${formatMoney(targetCents)} 元` };
          return { ...row, status: "\u6821\u9A8C\u5931\u8D25", detail: `改后商品应付不是 ${formatMoney(targetCents)} 元，未继续修改` };
        });
        const failed = rows.filter((row) => row.status === "\u6821\u9A8C\u5931\u8D25");
        setRows(rows);
        finish(run, { phase: failed.length ? "error" : "complete", message: failed.length ? `${failed.length} \u884C\u6821\u9A8C\u5931\u8D25\uFF0C\u672A\u7EE7\u7EED\u4FEE\u6539\u3002` : `校验完成：可识别行均为 ${formatMoney(targetCents)} 元。`, canApply: false });
        return cloneState(state);
      } catch (error) {
        if (run.signal.aborted) finish(run, { phase: "stopped", message: String(run.signal.reason || "\u5DF2\u505C\u6B62\u64CD\u4F5C"), canApply: false });
        else finish(run, { phase: "error", message: error instanceof Error ? error.message : String(error), canApply: false });
        throw error;
      }
    }
    async function restore() {
      const run = begin("restoring", "\u6B63\u5728\u6062\u590D\u6269\u5C55\u672C\u6B21\u4FEE\u6539\u8FC7\u7684\u8F93\u5165\u6846\u2026");
      try {
        if (!modifications.size) throw new Error("\u6CA1\u6709\u53EF\u6062\u590D\u7684\u4FEE\u6539\u8BB0\u5F55\uFF08\u8BB0\u5F55\u53EA\u4FDD\u5B58\u5728\u5F53\u524D\u9875\u9762\u5185\u5B58\u4E2D\uFF09");
        const results = [];
        for (const [key, record] of [...modifications]) {
          checkAbort(run.signal);
          const fresh = await findFreshRow(key, record.context, record.scrollTop, run.signal, record.fingerprint, null);
          const current = fresh.row.reductionInput.value;
          if (current !== record.after) {
            results.push(`${record.name}\uFF1A\u68C0\u6D4B\u5230\u7528\u6237\u540E\u6765\u4FEE\u6539\uFF0C\u5DF2\u4FDD\u7559\u5F53\u524D\u503C`);
            modifications.delete(key);
            continue;
          }
          setReduction(fresh.row, record.before);
          modifications.delete(key);
          results.push(`${record.name}\uFF1A\u5DF2\u6062\u590D`);
        }
        const conflicts = results.filter((text) => text.includes("\u4FDD\u7559"));
        finish(run, { phase: conflicts.length ? "error" : "complete", message: results.join("\uFF1B") || "\u6CA1\u6709\u53EF\u6062\u590D\u7684\u884C", canApply: false });
        return cloneState(state);
      } catch (error) {
        if (run.signal.aborted) finish(run, { phase: "stopped", message: String(run.signal.reason || "\u5DF2\u505C\u6B62\u64CD\u4F5C"), canApply: false });
        else finish(run, { phase: "error", message: error instanceof Error ? error.message : String(error), canApply: false });
        throw error;
      }
    }
    return {
      getState: () => cloneState(state),
      setTargetAmount,
      subscribe(listener) {
        listeners.add(listener);
        return () => listeners.delete(listener);
      },
      diagnose() {
        ensureRunningPage();
        return JSON.stringify(collectDiagnostics(doc), null, 2);
      },
      scan,
      apply,
      verify,
      restore,
      stop() {
        stopInternal();
        return Promise.resolve(cloneState(state));
      }
    };
  }

  // src/panel.css
  var panel_default = ':host {\r\n  all: initial;\r\n  position: fixed !important;\r\n  left: 16px !important;\r\n  bottom: 16px !important;\r\n  z-index: 2147483646 !important;\r\n  display: block !important;\r\n  color-scheme: light;\r\n  color: #17243a;\r\n  font: 400 14px/1.6 -apple-system, BlinkMacSystemFont, "Segoe UI", "Microsoft YaHei", "PingFang SC", sans-serif;\r\n  text-align: left;\r\n  letter-spacing: normal;\r\n  -webkit-font-smoothing: antialiased;\r\n}\r\n\r\n*, *::before, *::after { box-sizing: border-box; }\r\nbutton { font: inherit; }\r\n[hidden] { display: none !important; }\r\n.panel {\r\n  width: min(860px, calc(100vw - 32px));\r\n  max-height: calc(100dvh - 32px);\r\n  display: flex;\r\n  flex-direction: column;\r\n  overflow: hidden;\r\n  background: #fff;\r\n  border: 1px solid #aebbd0;\r\n  border-radius: 16px;\r\n  box-shadow: 0 16px 48px #15294129, 0 4px 12px #1529411a;\r\n}\r\n.header { display: flex; align-items: center; justify-content: space-between; gap: 24px; padding: 16px 24px; }\r\n.eyebrow { font-size: 13px; color: #526077; }\r\n.heading { margin: 0; font-size: 20px; line-height: 1.4; font-weight: 700; }\r\n.collapse { min-width: 56px; min-height: 40px; padding: 8px 12px; border: 1px solid #aebbd0; border-radius: 8px; background: #fff; color: #334963; cursor: pointer; }\r\n.body { display: flex; flex-direction: column; min-height: 0; padding: 0 24px 16px; overflow-y: auto; overscroll-behavior: contain; }\r\n.notice { padding: 12px 16px; border-left: 4px solid #235ad1; border-radius: 0 8px 8px 0; background: #eef4ff; }\r\n.notice-title { display: block; color: #193d7b; font-size: 16px; line-height: 1.6; font-weight: 700; }\r\n.notice-detail { margin: 4px 0 0; color: #334963; font-size: 14px; }\r\n.actions { display: flex; flex-wrap: wrap; gap: 8px; margin-top: 16px; }\r\n.action { min-height: 40px; padding: 8px 12px; border: 1px solid #aebbd0; border-radius: 8px; cursor: pointer; background: #fff; color: #263c59; font-weight: 700; font-size: 14px; line-height: 1.5; }\r\n.primary { background: #235ad1; border-color: #235ad1; color: #fff; }\r\n.stop { color: #922b28; border-color: #bd918f; }\r\n.action:hover:not(:disabled), .collapse:hover { background: #f1f5fc; border-color: #7b91b1; }\r\n.primary:hover:not(:disabled) { background: #1c49b2; border-color: #1c49b2; }\r\n.stop:hover:not(:disabled) { background: #fff2f1; border-color: #922b28; }\r\nbutton:focus-visible, .table-scroll:focus-visible { outline: 3px solid #123d9a; outline-offset: 3px; }\r\nbutton:disabled { color: #657087; border-color: #c7cfdb; background: #edf0f5; cursor: not-allowed; font-weight: 400; }\r\n.status-region { display: flex; align-items: baseline; gap: 8px; margin-top: 16px; color: #43536c; font-size: 14px; line-height: 1.6; }\r\n.phase { flex: 0 0 auto; color: #263c59; font-weight: 700; }\r\n.phase::before { content: ""; display: inline-block; width: 8px; height: 8px; margin-right: 8px; border-radius: 50%; background: #617691; }\r\n.phase.is-busy::before { background: #235ad1; animation: pulse 1.2s ease-in-out infinite; }\r\n.is-error .phase, .is-error .message { color: #a12924; }\r\n.is-error .phase::before { background: #a12924; }\r\n.message { overflow-wrap: anywhere; }\r\n.preview-header { display: flex; align-items: baseline; justify-content: space-between; gap: 16px; margin-top: 24px; margin-bottom: 8px; }\r\n.preview-heading { margin: 0; font-size: 16px; font-weight: 700; }\r\n.summary { color: #526077; font-size: 13px; }\r\n.table-scroll { min-height: 96px; max-height: min(320px, 38dvh); overflow: auto; flex: 0 1 auto; border: 1px solid #d8e0eb; border-radius: 8px; overscroll-behavior: contain; scrollbar-color: #9baac0 #f0f3f8; scrollbar-width: thin; }\r\n.preview-table { width: 100%; min-width: 792px; border-collapse: separate; border-spacing: 0; table-layout: fixed; font-size: 13px; line-height: 1.6; }\r\n.preview-table th { position: sticky; top: 0; z-index: 1; padding: 12px 8px; background: #f1f5fa; border-bottom: 1px solid #d8e0eb; font-weight: 700; color: #3d4f68; vertical-align: bottom; }\r\n.preview-table td { padding: 12px 8px; border-bottom: 1px solid #e7edf5; vertical-align: top; background: #fff; }\r\n.preview-table tr:last-child td { border-bottom: 0; }\r\n.preview-table tbody tr:hover td { background: #f8faff; }\r\n.preview-table .product { width: 168px; padding-left: 16px; text-align: left; }\r\n.product-name { display: block; overflow-wrap: anywhere; font-weight: 700; color: #263c59; }\r\n.preview-table .amount { width: 98px; text-align: right; font-variant-numeric: tabular-nums; }\r\n.preview-table td.amount { white-space: nowrap; }\r\n.preview-table .result { width: 216px; padding-left: 16px; padding-right: 16px; text-align: left; }\r\n.unrecognized { color: #7b5130; }\r\n.status-badge { display: inline-block; padding: 2px 8px; border-radius: 4px; background: #edf2f9; color: #354e72; font-weight: 700; }\r\n.status-badge.warning { color: #944718; background: #fff0dd; }\r\n.status-badge.success { color: #166241; background: #e8f5ed; }\r\n.status-badge.muted { color: #526077; background: #f0f2f6; }\r\n.row-detail { display: block; margin-top: 4px; color: #526077; overflow-wrap: anywhere; font-size: 13px; }\r\n.empty { padding: 24px 16px !important; text-align: center; color: #526077; }\r\n.empty strong, .empty span { display: block; font-weight: 400; }\r\n.empty strong { color: #263c59; font-size: 14px; margin-bottom: 4px; }\r\n.footer { margin: 12px 0 0; font-size: 13px; line-height: 1.6; color: #526077; }\r\n.sr-only { position: absolute; width: 1px; height: 1px; margin: -1px; padding: 0; overflow: hidden; clip: rect(0, 0, 0, 0); white-space: nowrap; border: 0; }\r\n.is-collapsed { width: auto; min-width: 280px; }\r\n.is-collapsed .header { padding: 12px 16px; }\r\n.is-collapsed .heading { font-size: 16px; }\r\n@keyframes pulse { 50% { opacity: .35; } }\r\n@media (prefers-reduced-motion: reduce) { .phase.is-busy::before { animation: none; } }\r\n@media (max-width: 600px) {\r\n  :host { left: 8px !important; bottom: 8px !important; }\r\n  .panel { width: calc(100vw - 16px); max-height: calc(100dvh - 16px); }\r\n  .header { padding: 12px 16px; }\r\n  .body { padding: 0 16px 16px; }\r\n  .notice { padding: 12px; }\r\n  .action { min-height: 44px; }\r\n  .status-region { flex-direction: column; gap: 4px; }\r\n  .preview-header { align-items: flex-start; flex-direction: column; gap: 4px; }\r\n  .is-collapsed { width: auto; }\r\n}\r\n';

  // src/panel.js
  panel_default += '\n.target-settings { margin-top: 16px; }\n.target-controls { display: flex; flex-wrap: wrap; align-items: center; gap: 8px; }\n.target-label { font-weight: 700; color: #263c59; }\n.target-input { width: 120px; min-height: 40px; padding: 8px 10px; border: 1px solid #aebbd0; border-radius: 8px; font: inherit; color: #17243a; background: #fff; font-variant-numeric: tabular-nums; }\n.target-input:focus-visible { outline: 3px solid #123d9a; outline-offset: 3px; }\n.target-input[aria-invalid="true"] { border-color: #a12924; }\n.target-input:disabled { background: #edf0f5; color: #657087; }\n.target-help, .target-error { margin: 6px 0 0; font-size: 13px; line-height: 1.6; }\n.target-help { color: #526077; }\n.target-error { color: #a12924; }\n';
  var PHASE_LABELS = {
    idle: "\u7B49\u5F85\u626B\u63CF",
    scanning: "\u6B63\u5728\u626B\u63CF",
    ready: "\u9884\u89C8\u5C31\u7EEA",
    applying: "\u6B63\u5728\u5E94\u7528\u4FEE\u6539",
    verifying: "\u6B63\u5728\u6821\u9A8C",
    restoring: "\u6B63\u5728\u6062\u590D",
    stopped: "\u5DF2\u505C\u6B62",
    error: "\u64CD\u4F5C\u5DF2\u6682\u505C",
    complete: "\u64CD\u4F5C\u5B8C\u6210"
  };
  function element(tag, className, text) {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (text !== void 0) node.textContent = text;
    return node;
  }
  function money(cents) {
    if (!Number.isSafeInteger(cents)) return "\u672A\u8BC6\u522B";
    const absolute = Math.abs(cents);
    return `${cents < 0 ? "-" : ""}${Math.floor(absolute / 100)}.${String(absolute % 100).padStart(2, "0")}`;
  }
  function statusTone(status) {
    if (/未识别|错误|失败|异常|暂停|确认|不正确/.test(status)) return "warning";
    if (/通过|成功|已校验|已恢复|正确|完成/.test(status)) return "success";
    if (/跳过|停止/.test(status)) return "muted";
    return "neutral";
  }
  function mountPanel(controller) {
    const host = element("div");
    host.id = "jm-price-helper";
    host.setAttribute("data-jm-price-helper", "");
    const shadowRoot = host.attachShadow({ mode: "open" });
    const style = element("style");
    style.textContent = panel_default;
    const panel = element("section", "panel");
    panel.setAttribute("aria-label", "\u4EAC\u9EA6\u8BA2\u5355\u5546\u54C1\u6539\u4EF7\u8F85\u52A9\u5DE5\u5177");
    const header = element("header", "header");
    const headingGroup = element("div", "heading-group");
    const eyebrow = element("div", "eyebrow", "商品改价 · 页面辅助 · v1.2.0");
    const heading = element("h2", "heading", "\u4EAC\u9EA6\u6539\u4EF7\u52A9\u624B");
    headingGroup.append(eyebrow, heading);
    const collapse = element("button", "collapse", "\u6536\u8D77");
    collapse.type = "button";
    collapse.setAttribute("aria-expanded", "true");
    collapse.setAttribute("aria-controls", "jm-helper-body");
    header.append(headingGroup, collapse);
    const body = element("div", "body");
    body.id = "jm-helper-body";
    const notice = element("div", "notice");
    notice.append(
      element("strong", "notice-title", "\u5F53\u524D\u5DE5\u5177\u53EA\u4FEE\u6539\u9875\u9762\u8F93\u5165\u6846\uFF0C\u4E0D\u4F1A\u81EA\u52A8\u63D0\u4EA4\u8BA2\u5355\u6539\u4EF7\u3002"),
      element("p", "notice-detail", "\u201C\u5E94\u7528\u4FEE\u6539\u201D\u53EA\u586B\u5199\u51CF\u4EF7\u91D1\u989D\uFF1B\u786E\u5B9A\u6539\u4EF7\u5FC5\u987B\u7531\u4F60\u624B\u52A8\u70B9\u51FB\u4EAC\u9EA6\u6309\u94AE\u3002")
    );
    const targetSettings = element("div", "target-settings");
    const targetControls = element("div", "target-controls");
    const targetLabel = element("label", "target-label", "每行改后应付金额");
    targetLabel.htmlFor = "jm-target-amount";
    const targetInput = element("input", "target-input");
    targetInput.id = "jm-target-amount";
    targetInput.type = "text";
    targetInput.inputMode = "decimal";
    targetInput.autocomplete = "off";
    targetInput.spellcheck = false;
    targetInput.setAttribute("aria-describedby", "jm-target-help jm-target-error");
    const targetMinus = element("button", "action secondary", "−0.01");
    targetMinus.type = "button";
    targetMinus.setAttribute("aria-label", "目标金额减少0.01元");
    const targetPlus = element("button", "action secondary", "+0.01");
    targetPlus.type = "button";
    targetPlus.setAttribute("aria-label", "目标金额增加0.01元");
    targetControls.append(targetLabel, targetInput, element("span", "", "元"), targetMinus, targetPlus);
    const targetHelp = element("p", "target-help", "输入每行商品改后的应付金额，至少0.01元，最多2位小数；修改后请重新扫描。");
    targetHelp.id = "jm-target-help";
    const targetError = element("p", "target-error");
    targetError.id = "jm-target-error";
    targetError.setAttribute("aria-live", "polite");
    targetSettings.append(targetControls, targetHelp, targetError);
    const actions = element("div", "actions");
    actions.setAttribute("aria-label", "\u8F85\u52A9\u64CD\u4F5C");
    const buttons = {};
    const actionSpecs = [
      ["scan", "\u626B\u63CF\u5F53\u524D\u6539\u4EF7\u7A97\u53E3", "secondary"],
      ["apply", "\u81EA\u52A8\u586B\u5199\u51CF\u4EF7\uFF08\u5E94\u7528\u4FEE\u6539\uFF09", "primary"],
      ["verify", "\u6821\u9A8C\u6539\u540E\u91D1\u989D", "secondary"],
      ["restore", "\u6062\u590D\u4FEE\u6539\u524D\u91D1\u989D", "secondary"],
      ["diagnose", "\u590D\u5236\u8BC6\u522B\u8BCA\u65AD", "secondary"],
      ["stop", "\u505C\u6B62\u64CD\u4F5C", "stop"]
    ];
    let destroyed = false;
    let localError = "";
    let localFeedback = "";
    let lastState = controller.getState();
    function changeTarget(text) {
      localError = "";
      localFeedback = "";
      try {
        controller.setTargetAmount(text);
      } catch (error) {
        localError = error instanceof Error ? error.message : String(error);
        render(controller.getState());
      }
    }
    targetInput.addEventListener("input", () => changeTarget(targetInput.value));
    targetInput.addEventListener("change", () => changeTarget(targetInput.value));
    for (const [button, step] of [[targetMinus, -1], [targetPlus, 1]]) {
      button.addEventListener("click", () => {
        const state = controller.getState();
        if (state.busy || !Number.isSafeInteger(state.targetCents)) return;
        const next = state.targetCents + step;
        if (Number.isSafeInteger(next) && next >= 1) changeTarget(formatMoney(next));
      });
    }
    for (const [method, label, className] of actionSpecs) {
      const button = element("button", `action ${className}`, label);
      button.type = "button";
      button.dataset.action = method;
      button.addEventListener("click", async () => {
        localError = "";
        localFeedback = "";
        try {
          if (["scan", "apply", "verify"].includes(method)) {
            const state = controller.setTargetAmount(targetInput.value);
            if (state.targetError) return;
          }
          if (method === "diagnose") {
            const diagnostic = await controller.diagnose();
            try {
              if (navigator.clipboard?.writeText) await navigator.clipboard.writeText(diagnostic);
              else throw new Error("Clipboard API \u4E0D\u53EF\u7528");
            } catch {
              const textarea = element("textarea");
              textarea.value = diagnostic;
              textarea.setAttribute("readonly", "");
              textarea.style.cssText = "position:fixed;left:-10000px;top:0;opacity:0";
              shadowRoot.append(textarea);
              let copied;
              try {
                textarea.select();
                copied = document.execCommand("copy");
              } finally {
                textarea.remove();
              }
              if (!copied) throw new Error("\u6D4F\u89C8\u5668\u672A\u5141\u8BB8\u590D\u5236\u5230\u526A\u8D34\u677F");
            }
            localFeedback = "\u8BC6\u522B\u8BCA\u65AD\u5DF2\u590D\u5236\uFF1B\u5185\u5BB9\u4EC5\u5305\u542B\u8868\u683C\u7ED3\u6784\u548C\u8BA1\u6570\uFF0C\u4E0D\u542B\u5546\u54C1\u540D\u79F0\u3001\u91D1\u989D\u3001\u8D26\u53F7\u3001\u8BA2\u5355\u53F7\u3001\u5BA2\u6237\u8D44\u6599\u6216\u767B\u5F55\u51ED\u8BC1\u3002";
            render(controller.getState());
            return;
          }
          await controller[method]();
        } catch (error) {
          localError = method === "diagnose" ? `\u8BCA\u65AD\u590D\u5236\u672A\u5B8C\u6210\uFF1A${error instanceof Error ? error.message : String(error)}` : `\u64CD\u4F5C\u672A\u5B8C\u6210\uFF1A${error instanceof Error ? error.message : String(error)}`;
          if (!destroyed) render(controller.getState());
        }
      });
      buttons[method] = button;
      actions.append(button);
    }
    const statusRegion = element("div", "status-region");
    statusRegion.setAttribute("role", "status");
    statusRegion.setAttribute("aria-live", "polite");
    statusRegion.setAttribute("aria-atomic", "true");
    const phase = element("span", "phase", "\u7B49\u5F85\u626B\u63CF");
    const message = element("span", "message");
    statusRegion.append(phase, message);
    const previewHeader = element("div", "preview-header");
    const previewHeading = element("h3", "preview-heading", "\u4FEE\u6539\u9884\u89C8");
    const summary = element("span", "summary", "\u5C1A\u672A\u626B\u63CF");
    previewHeader.append(previewHeading, summary);
    const tableScroll = element("div", "table-scroll");
    tableScroll.tabIndex = 0;
    tableScroll.setAttribute("role", "region");
    tableScroll.setAttribute("aria-label", "\u5546\u54C1\u6539\u4EF7\u9884\u89C8\uFF0C\u53EF\u6EDA\u52A8\u67E5\u770B");
    const table = element("table", "preview-table");
    const caption = element("caption", "sr-only", "\u5546\u54C1\u6539\u4EF7\u9884\u89C8\uFF0C\u6240\u6709\u91D1\u989D\u5355\u4F4D\u5747\u4E3A\u5143");
    const thead = element("thead");
    const headRow = element("tr");
    const columns = [
      ["\u5546\u54C1\u540D\u79F0", "product"],
      ["\u539F\u5546\u54C1\u5E94\u4ED8", "amount"],
      ["\u5C06\u8981\u586B\u5199\u7684\u51CF\u4EF7\u91D1\u989D", "amount"],
      ["\u9884\u8BA1\u6539\u540E\u5546\u54C1\u5E94\u4ED8", "amount"],
      ["\u5B9E\u9645\u6539\u540E\u5546\u54C1\u5E94\u4ED8", "amount"],
      ["\u72B6\u6001", "result"]
    ];
    for (const [label, className] of columns) {
      const th = element("th", className, label);
      th.scope = "col";
      headRow.append(th);
    }
    thead.append(headRow);
    const tbody = element("tbody");
    table.append(caption, thead, tbody);
    tableScroll.append(table);
    const footer = element("p", "footer");
    body.append(notice, targetSettings, actions, statusRegion, previewHeader, tableScroll, footer);
    panel.append(header, body);
    shadowRoot.append(style, panel);
    document.documentElement.append(host);
    function setCollapsed(collapsed) {
      panel.classList.toggle("is-collapsed", collapsed);
      body.hidden = collapsed;
      collapse.textContent = collapsed ? "\u5C55\u5F00" : "\u6536\u8D77";
      collapse.setAttribute("aria-expanded", String(!collapsed));
      collapse.setAttribute("aria-label", collapsed ? "\u5C55\u5F00\u4EAC\u9EA6\u6539\u4EF7\u52A9\u624B" : "\u6536\u8D77\u4EAC\u9EA6\u6539\u4EF7\u52A9\u624B");
    }
    collapse.addEventListener("click", () => setCollapsed(!body.hidden));
    function render(state = {}) {
      lastState = state;
      const rows = Array.isArray(state.rows) ? state.rows : [];
      const busy = Boolean(state.busy);
      const validTarget = Number.isSafeInteger(state.targetCents) && state.targetCents >= 1 && !state.targetError;
      const inputValue = String(state.targetInput ?? "0.01");
      if (targetInput.value !== inputValue) targetInput.value = inputValue;
      targetInput.disabled = busy;
      targetInput.setAttribute("aria-invalid", String(!validTarget));
      targetError.textContent = state.targetError || "";
      targetError.hidden = !state.targetError;
      targetMinus.disabled = busy || !validTarget || state.targetCents <= 1;
      targetPlus.disabled = busy || !validTarget || state.targetCents >= Number.MAX_SAFE_INTEGER;
      footer.textContent = validTarget ? `目标：每行改后商品应付 ${money(state.targetCents)} 元 · 仅适用于数量为1的商品` : "请输入有效的目标金额后再扫描。";
      phase.textContent = PHASE_LABELS[state.phase] || state.phase || "\u7B49\u5F85\u626B\u63CF";
      message.textContent = localError || localFeedback || state.message || "\u8BF7\u5148\u6253\u5F00\u4EAC\u9EA6\u7684\u5546\u54C1\u6539\u4EF7\u4FA7\u680F\uFF0C\u518D\u626B\u63CF\u5F53\u524D\u7A97\u53E3\u3002";
      statusRegion.classList.toggle("is-error", Boolean(localError) || state.phase === "error");
      phase.classList.toggle("is-busy", busy);
      buttons.scan.disabled = busy || !validTarget;
      buttons.apply.disabled = busy || !validTarget || !state.canApply;
      buttons.verify.disabled = busy || !validTarget || rows.length === 0;
      buttons.restore.disabled = busy || !state.canRestore;
      buttons.stop.disabled = !busy;
      buttons.apply.title = state.canApply ? "\u53EA\u586B\u5199\u9875\u9762\u51CF\u4EF7\u8F93\u5165\u6846\uFF0C\u4E0D\u63D0\u4EA4\u8BA2\u5355" : "\u626B\u63CF\u5E76\u786E\u8BA4\u5168\u90E8\u5546\u54C1\u53EF\u8BC6\u522B\u540E\u624D\u80FD\u5E94\u7528";
      buttons.restore.title = state.canRestore ? "\u6062\u590D\u672C\u6B21\u5DE5\u5177\u8BB0\u5F55\u7684\u4FEE\u6539\u524D\u8F93\u5165\u503C" : "\u5C1A\u65E0\u53EF\u6062\u590D\u7684\u4FEE\u6539\u8BB0\u5F55";
      summary.textContent = rows.length ? `${rows.length} \u884C\u5546\u54C1 \xB7 \u91D1\u989D\u5355\u4F4D\uFF1A\u5143` : "\u5C1A\u672A\u626B\u63CF";
      const fragment = document.createDocumentFragment();
      if (!rows.length) {
        const tr = element("tr");
        const td = element("td", "empty");
        td.colSpan = 6;
        td.append(
          element("strong", "", busy ? "\u6B63\u5728\u8BFB\u53D6\u5F53\u524D\u6539\u4EF7\u7A97\u53E3\u2026" : "\u626B\u63CF\u540E\u5C06\u5728\u8FD9\u91CC\u663E\u793A\u6BCF\u884C\u5546\u54C1"),
          element("span", "", "\u4EC5\u8BC6\u522B\u201C\u5546\u54C1\u6539\u4EF7\u201D\u6A21\u5F0F\u4E2D\u7684\u201C\u51CF\u201D\u91D1\u989D\u8F93\u5165\u6846\u3002")
        );
        tr.append(td);
        fragment.append(tr);
      }
      for (const row of rows) {
        const tr = element("tr");
        tr.dataset.rowKey = String(row.key ?? "");
        const product = element("td", "product");
        product.append(element("span", "product-name", row.name || "\u672A\u8BC6\u522B\u5546\u54C1\u540D\u79F0"));
        const expected = row.expectedCents;
        tr.append(product);
        for (const value of [row.originalCents, row.reductionCents, expected, row.actualCents]) {
          const td = element("td", `amount${value === null || value === void 0 ? " unrecognized" : ""}`, money(value));
          tr.append(td);
        }
        const status = String(row.status || "\u5F85\u6821\u9A8C");
        const result = element("td", "result");
        result.append(element("span", `status-badge ${statusTone(status)}`, status));
        if (row.detail) result.append(element("span", "row-detail", String(row.detail)));
        tr.append(result);
        fragment.append(tr);
      }
      tbody.replaceChildren(fragment);
    }
    render(lastState);
    const unsubscribe = controller.subscribe((state) => {
      localError = "";
      localFeedback = "";
      if (!destroyed) render(state);
    });
    return {
      host,
      shadowRoot,
      setCollapsed,
      destroy() {
        destroyed = true;
        if (typeof unsubscribe === "function") unsubscribe();
        host.remove();
      }
    };
  }

  // src/content.js
  function boot() {
    if (document.getElementById("jm-price-helper")) return;
    if (!isAllowedUrl(location.href)) return;
    const controller = createController(document);
    const panel = mountPanel(controller);
    window.__JD_PRICE_HELPER_CONTROLLER__ = controller;
    window.__JD_PRICE_HELPER_PANEL__ = panel;
  }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", boot, { once: true });
  else boot();
})();
