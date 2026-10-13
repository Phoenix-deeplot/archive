"use strict";

/*
 * The simulator deliberately keeps the business state independent from the DOM.
 * A future React / Vercel shell can call the same weekly engine without changing
 * the physical rules: state + player decisions => next state + events.
 */
(function () {
  const CONFIG = {
    rounds: 18,
    orderLead: 2,
    productionLead: 1,
    shipmentLead: 2,
    customerDeliveryLead: 2,
    reviewWeeks: 1,
    holdingCost: 0.5,
    backlogCost: 1,
    initialInventory: 12,
    initialFlow: 4,
    maxOrder: 99,
    demandJitter: 0,
    demandSeed: 20261010,
    recommendationMode: "local",
    expediteEnabled: false,
    expediteReduction: 1,
    expediteCost: 2
  };

  const CUSTOMER = "customer";
  const PRODUCER = 4;
  const GUIDE_COMPLETE_KEY = "bullwhip-guide-v1-complete";
  const GUIDE_SUPPRESS_KEY = "bullwhip-guide-v1-suppress";
  const ROLES = [
    { name: "零售商", short: "零售", color: "#2375e1", icon: "⌂" },
    { name: "批发商", short: "批发", color: "#1caa76", icon: "▦" },
    { name: "分销商", short: "分销", color: "#e99a21", icon: "⌘" },
    { name: "工厂", short: "工厂", color: "#7657d7", icon: "⚙" }
  ];

  const $ = (id) => document.getElementById(id);
  const ui = {
    week: $("weekValue"),
    cost: $("costValue"),
    service: $("serviceValue"),
    bullwhip: $("bullwhipValue"),
    mode: $("modeSelect"),
    role: $("roleSelect"),
    roleWrap: $("roleSelectWrap"),
    restart: $("restartButton"),
    settingsButton: $("settingsButton"),
    settingsDialog: $("settingsDialog"),
    closeSettings: $("closeSettings"),
    cancelSettings: $("cancelSettings"),
    saveSettings: $("saveSettings"),
    orderLeadInput: $("orderLeadInput"),
    shipmentLeadInput: $("shipmentLeadInput"),
    customerDeliveryLeadInput: $("customerDeliveryLeadInput"),
    productionLeadInput: $("productionLeadInput"),
    demandJitterInput: $("demandJitterInput"),
    demandJitterValue: $("demandJitterValue"),
    recommendationModeInput: $("recommendationModeInput"),
    demandSeedInput: $("demandSeedInput"),
    expediteEnabledInput: $("expediteEnabledInput"),
    expediteReductionInput: $("expediteReductionInput"),
    expediteCostInput: $("expediteCostInput"),
    settingsPreview: $("settingsPreview"),
    guideButton: $("guideButton"),
    systemMap: $("systemMap"),
    stages: $("stages"),
    visibility: $("visibilityButton"),
    coachTitle: $("coachTitle"),
    coachSummary: $("coachSummary"),
    coachMath: $("coachMath"),
    coachCard: $("coachCard"),
    sandboxDirectControls: $("sandboxDirectControls"),
    explain: $("explainButton"),
    apply: $("applyButton"),
    submit: $("submitButton"),
    decisionStatus: $("decisionStatus"),
    decisionDetail: $("decisionDetail"),
    fast: $("reducedMotion"),
    chart: $("chart"),
    insight: $("insightStrip"),
    dialog: $("resultDialog"),
    resultIntro: $("resultIntro"),
    resultContext: $("resultContext"),
    resultMetrics: $("resultMetrics"),
    roleComparisonBody: $("roleComparisonBody"),
    turningPoints: $("turningPoints"),
    closeResult: $("closeResult"),
    playAgain: $("playAgain"),
    switchStrategy: $("switchStrategy"),
    guideDialog: $("guideDialog"),
    guideSpotlight: $("guideSpotlight"),
    guidePopover: document.querySelector(".guide-popover"),
    guideProgress: $("guideProgress"),
    guideTitle: $("guideTitle"),
    guideText: $("guideText"),
    guideSuppress: $("guideSuppress"),
    guidePrevious: $("guidePrevious"),
    guideNext: $("guideNext"),
    guideSkip: $("guideSkip"),
    guideClose: $("guideClose")
  };

  const GUIDE_STEPS = [
    {
      target: "mode",
      title: "先从教学模式开始",
      text: "你只管理一个环节；其他环节按同一套稳态策略运行，先建立对本地库存和延迟的感觉。"
    },
    {
      target: "flow",
      title: "黄色不是货，蓝色才是货",
      text: "黄色补货订单先传向上游；蓝色货物到仓前仍不能服务今天的客户。"
    },
    {
      target: "inventory",
      title: "不要只看现货",
      text: "库存位置 = 现货 − 背单 + 未完成补给。它能避免重复下单，但不等于可立即发货。"
    },
    {
      target: "coach",
      title: "建议不是黑箱",
      text: "点击“展开手算”可查看本周现货账、W+1/W+2 预警、库存头寸和建议订货量；设置中的“共享终端需求”只改变预测来源，不改变物流延迟。"
    },
    {
      target: "advance",
      title: "确认后再看下一周",
      text: "每周先签收、到货、接单和发运，再进入下一次补货决策。"
    }
  ];

  let game = null;
  let sequence = 0;
  let idCounter = 0;
  let coachOpen = false;
  let revealNetwork = false;
  let guideIndex = 0;
  let guideAutoHandled = false;
  let guideOpener = null;
  let settingsOpener = null;
  const completedExperiments = new Map();

  function nextId(prefix) {
    idCounter += 1;
    return `${prefix}-${idCounter}`;
  }

  function clamp(value, min, max) {
    return Math.max(min, Math.min(max, value));
  }

  function money(value) {
    return `¥${Math.round(value).toLocaleString("zh-CN")}`;
  }

  function qty(value) {
    return `${Math.round(value)} 箱`;
  }

  function average(values) {
    if (!values.length) return CONFIG.initialFlow;
    return values.reduce((sum, item) => sum + item, 0) / values.length;
  }

  function variance(values) {
    if (values.length < 2) return 0;
    const mean = average(values);
    return values.reduce((sum, value) => sum + (value - mean) ** 2, 0) / values.length;
  }

  function standardDeviation(values) {
    return Math.sqrt(variance(values));
  }

  function pause(ms, run) {
    return new Promise((resolve) => {
      window.setTimeout(() => resolve(run === sequence), ms);
    });
  }

  function safeRead(key) {
    try {
      return window.localStorage.getItem(key) === "1";
    } catch (_) {
      return false;
    }
  }

  function safeWrite(key, value) {
    try {
      window.localStorage.setItem(key, value ? "1" : "0");
    } catch (_) {
      // Storage is an optional convenience, not part of simulation correctness.
    }
  }

  function numberFromInput(input, fallback, min, max) {
    const value = Number(input.value);
    return clamp(Number.isFinite(value) ? Math.round(value) : fallback, min, max);
  }

  function recommendationMode(value) {
    return value === "shared" ? "shared" : "local";
  }

  function recommendationModeLabel(value) {
    return recommendationMode(value) === "shared" ? "共享终端需求协同" : "本地订单预测";
  }

  function readSettingsForm() {
    return {
      orderLead: numberFromInput(ui.orderLeadInput, CONFIG.orderLead, 1, 6),
      shipmentLead: numberFromInput(ui.shipmentLeadInput, CONFIG.shipmentLead, 1, 6),
      customerDeliveryLead: numberFromInput(ui.customerDeliveryLeadInput, CONFIG.customerDeliveryLead, 1, 6),
      productionLead: numberFromInput(ui.productionLeadInput, CONFIG.productionLead, 1, 6),
      demandJitter: numberFromInput(ui.demandJitterInput, CONFIG.demandJitter, 0, 6),
      demandSeed: numberFromInput(ui.demandSeedInput, CONFIG.demandSeed, 0, 2147483647),
      recommendationMode: recommendationMode(ui.recommendationModeInput.value),
      expediteEnabled: ui.expediteEnabledInput.checked,
      expediteReduction: numberFromInput(ui.expediteReductionInput, CONFIG.expediteReduction, 1, 3),
      expediteCost: numberFromInput(ui.expediteCostInput, CONFIG.expediteCost, 0, 50)
    };
  }

  function expeditedShipmentLead(settings) {
    return Math.max(1, settings.shipmentLead - settings.expediteReduction);
  }

  function syncSettingsForm() {
    ui.orderLeadInput.value = String(CONFIG.orderLead);
    ui.shipmentLeadInput.value = String(CONFIG.shipmentLead);
    ui.customerDeliveryLeadInput.value = String(CONFIG.customerDeliveryLead);
    ui.productionLeadInput.value = String(CONFIG.productionLead);
    ui.demandJitterInput.value = String(CONFIG.demandJitter);
    ui.demandSeedInput.value = String(CONFIG.demandSeed);
    ui.recommendationModeInput.value = recommendationMode(CONFIG.recommendationMode);
    ui.expediteEnabledInput.checked = CONFIG.expediteEnabled;
    ui.expediteReductionInput.value = String(CONFIG.expediteReduction);
    ui.expediteCostInput.value = String(CONFIG.expediteCost);
    updateSettingsPreview();
  }

  function updateSettingsPreview() {
    const settings = readSettingsForm();
    const expeditedLead = expeditedShipmentLead(settings);
    const expeditedText = settings.expediteEnabled
      ? `；加急运输 ${expeditedLead} 周，每箱另加 ${money(settings.expediteCost)}`
      : "；当前未启用加急";
    const strategyText = settings.recommendationMode === "shared"
      ? "共享终端需求只改变预测信息；补货信号和货物仍按各自周期传递"
      : "各环节只根据自己最近收到的订单做预测";
    ui.demandJitterValue.textContent = `±${settings.demandJitter} 箱`;
    ui.settingsPreview.textContent = `情景 #${settings.demandSeed}：保存后和“重玩同路径”都会复用这条需求路径。${strategyText}。零售本周补货最早 W+${settings.orderLead + settings.shipmentLead} 到仓；客户发运后 W+${settings.customerDeliveryLead} 签收${expeditedText}。`;
    document.querySelectorAll(".expedite-setting").forEach((field) => {
      field.classList.toggle("is-disabled", !settings.expediteEnabled);
      field.querySelectorAll("input").forEach((input) => { input.disabled = !settings.expediteEnabled; });
    });
  }

  function openSettings() {
    settingsOpener = document.activeElement;
    syncSettingsForm();
    ui.settingsButton.setAttribute("aria-expanded", "true");
    if (!ui.settingsDialog.open) {
      if (typeof ui.settingsDialog.showModal === "function") ui.settingsDialog.showModal();
      else ui.settingsDialog.setAttribute("open", "");
    }
    window.requestAnimationFrame(() => ui.orderLeadInput.focus());
  }

  function closeSettings() {
    if (ui.settingsDialog.open) ui.settingsDialog.close();
    ui.settingsButton.setAttribute("aria-expanded", "false");
    if (settingsOpener && typeof settingsOpener.focus === "function") settingsOpener.focus();
    else ui.settingsButton.focus();
  }

  function saveSettings() {
    const settings = readSettingsForm();
    Object.assign(CONFIG, settings);
    closeSettings();
    resetGame();
  }

  function makeSeededRandom(seed) {
    let state = Number(seed) >>> 0;
    return () => {
      state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
      return state / 4294967296;
    };
  }

  function buildDemand(seed) {
    const random = makeSeededRandom(seed);
    return Array.from({ length: CONFIG.rounds }, (_, index) => {
      const baseline = index < 4 ? 4 : index < 8 ? 8 : index < 12 ? 5 : 4;
      if (!CONFIG.demandJitter) return baseline;
      const randomOffset = Math.floor(random() * (CONFIG.demandJitter * 2 + 1)) - CONFIG.demandJitter;
      return Math.max(0, baseline + randomOffset);
    });
  }

  function makeStage(index) {
    return {
      index,
      onHand: CONFIG.initialInventory,
      backlog: 0,
      receivedThisWeek: 0,
      dispatchedThisWeek: 0,
      arrivalsThisWeek: 0,
      customerDeliveredThisWeek: 0,
      openingOnHand: CONFIG.initialInventory,
      pendingDemand: [],
      demandHistory: [4, 4, 4],
      lastOrder: CONFIG.initialFlow
    };
  }

  function makeGame() {
    idCounter = 0;
    const mode = ui.mode.value;
    const playerIndex = Number(ui.role.value);
    const demandSeed = CONFIG.demandSeed;
    const demandPlan = buildDemand(demandSeed);
    const recommendation = recommendationMode(CONFIG.recommendationMode);
    const scenarioKey = JSON.stringify({
      mode,
      playerIndex,
      demandPlan,
      orderLead: CONFIG.orderLead,
      shipmentLead: CONFIG.shipmentLead,
      customerDeliveryLead: CONFIG.customerDeliveryLead,
      productionLead: CONFIG.productionLead,
      holdingCost: CONFIG.holdingCost,
      backlogCost: CONFIG.backlogCost,
      initialInventory: CONFIG.initialInventory,
      initialFlow: CONFIG.initialFlow,
      expediteEnabled: CONFIG.expediteEnabled,
      expediteReduction: CONFIG.expediteReduction,
      expediteCost: CONFIG.expediteCost
    });
    const fresh = {
      mode,
      playerIndex,
      recommendationMode: recommendation,
      demandSeed,
      scenarioKey,
      week: 0,
      phase: "opening",
      stages: ROLES.map((_, index) => makeStage(index)),
      demandPlan,
      terminalDemandHistory: [CONFIG.initialFlow, CONFIG.initialFlow, CONFIG.initialFlow],
      orderMessages: [],
      purchaseOrders: [],
      customerOrders: [],
      supplyShipments: [],
      customerShipments: [],
      productionJobs: [],
      history: [],
      events: [],
      recommendations: [],
      drafts: [],
      expediteDrafts: ROLES.map(() => false),
      totalCost: 0,
      customerDemand: 0,
      customerDispatched: 0,
      customerDelivered: 0,
      fast: ui.fast.checked
    };

    // Opening pipeline avoids a misleading cold-start shortage. These shipments
    // existed before W1 and count only as physical inbound freight.
    for (let index = 0; index < ROLES.length; index += 1) {
      const supplier = index === ROLES.length - 1 ? PRODUCER : index + 1;
      for (let eta = 1; eta <= CONFIG.shipmentLead; eta += 1) {
        fresh.supplyShipments.push(createSupplyShipment(supplier, index, CONFIG.initialFlow, eta, 0, null, true));
      }
    }

    // The factory needs one historical production bucket for every configured
    // production week, otherwise a longer production setting creates a fake
    // first-week shortage before the player has made a decision.
    for (let offset = 0; offset < CONFIG.productionLead; offset += 1) {
      const factorySeedOrder = {
        id: nextId("po"),
        buyer: 3,
        supplier: PRODUCER,
        total: CONFIG.initialFlow,
        remainingToShip: CONFIG.initialFlow,
        shippedQty: 0,
        receivedQty: 0,
        placedWeek: -CONFIG.orderLead - offset,
        supplierReceivedWeek: 0,
        shipmentLead: CONFIG.shipmentLead,
        expedited: false,
        seeded: true
      };
      fresh.purchaseOrders.push(factorySeedOrder);
      fresh.productionJobs.push({
        id: nextId("production"),
        to: 3,
        qty: CONFIG.initialFlow,
        eta: offset + 2,
        purchaseOrderId: factorySeedOrder.id,
        queuedWeek: 0,
        seeded: true
      });
    }
    return fresh;
  }

  function createSupplyShipment(from, to, amount, eta, week, purchaseOrderId, seeded) {
    return {
      id: nextId("supply"),
      from,
      to,
      qty: amount,
      eta,
      departedWeek: week,
      purchaseOrderId: purchaseOrderId || null,
      seeded: Boolean(seeded)
    };
  }

  function createCustomerShipment(amount, eta, customerOrderId) {
    return {
      id: nextId("delivery"),
      from: 0,
      to: CUSTOMER,
      qty: amount,
      eta,
      departedWeek: game.week,
      customerOrderId
    };
  }

  function createProductionJob(amount, purchaseOrderId) {
    return {
      id: nextId("production"),
      to: 3,
      qty: amount,
      eta: CONFIG.productionLead,
      purchaseOrderId,
      queuedWeek: game.week
    };
  }

  function createPurchaseOrder(from, amount, expedited) {
    const to = from === ROLES.length - 1 ? PRODUCER : from + 1;
    const useExpedite = Boolean(expedited && CONFIG.expediteEnabled);
    const order = {
      id: nextId("po"),
      buyer: from,
      supplier: to,
      total: amount,
      remainingToShip: amount,
      shippedQty: 0,
      receivedQty: 0,
      placedWeek: game.week,
      supplierReceivedWeek: null,
      shipmentLead: useExpedite ? expeditedShipmentLead(CONFIG) : CONFIG.shipmentLead,
      expedited: useExpedite,
      expediteFee: useExpedite ? amount * CONFIG.expediteCost : 0
    };
    game.purchaseOrders.push(order);
    game.orderMessages.push({
      id: nextId("message"),
      purchaseOrderId: order.id,
      from,
      to,
      qty: amount,
      eta: CONFIG.orderLead,
      placedWeek: game.week
    });
    return order;
  }

  function createCustomerOrder(amount) {
    const order = {
      id: nextId("sales"),
      total: amount,
      remainingToShip: amount,
      shippedQty: 0,
      deliveredQty: 0,
      placedWeek: game.week
    };
    game.customerOrders.push(order);
    return order;
  }

  function roleName(index) {
    if (index === PRODUCER) return "原料源";
    if (index === CUSTOMER) return "客户";
    return ROLES[index] ? ROLES[index].name : "上游";
  }

  function findPurchaseOrder(id) {
    return game.purchaseOrders.find((order) => order.id === id);
  }

  function findCustomerOrder(id) {
    return game.customerOrders.find((order) => order.id === id);
  }

  function addDemandLine(stageIndex, amount, buyer, purchaseOrderId, source, customerOrderId) {
    if (amount <= 0) return;
    const stage = game.stages[stageIndex];
    stage.pendingDemand.push({
      id: nextId("line"),
      qty: amount,
      buyer,
      purchaseOrderId: purchaseOrderId || null,
      customerOrderId: customerOrderId || null,
      source,
      createdWeek: game.week
    });
    stage.receivedThisWeek += amount;
  }

  function advanceCustomerShipments(events) {
    const remaining = [];
    game.customerShipments.forEach((shipment) => {
      shipment.eta -= 1;
      if (shipment.eta > 0) {
        remaining.push(shipment);
        return;
      }
      const order = findCustomerOrder(shipment.customerOrderId);
      if (!order) throw new Error(`Missing customer order for delivery ${shipment.id}`);
      order.deliveredQty += shipment.qty;
      game.customerDelivered += shipment.qty;
      game.stages[0].customerDeliveredThisWeek += shipment.qty;
      events.push({
        kind: "customer-delivery",
        icon: "✓",
        qty: shipment.qty,
        text: `客户签收 ${qty(shipment.qty)}。这批货此前已从零售商库存出库，不再属于可用现货。`
      });
    });
    game.customerShipments = remaining;
  }

  function advanceSupplyShipments(events) {
    const remaining = [];
    game.supplyShipments.forEach((shipment) => {
      shipment.eta -= 1;
      if (shipment.eta > 0) {
        remaining.push(shipment);
        return;
      }
      const destination = game.stages[shipment.to];
      destination.onHand += shipment.qty;
      destination.arrivalsThisWeek += shipment.qty;
      if (shipment.purchaseOrderId) {
        const order = findPurchaseOrder(shipment.purchaseOrderId);
        if (!order) throw new Error(`Missing purchase order for shipment ${shipment.id}`);
        order.receivedQty += shipment.qty;
      }
      events.push({
        kind: "arrival",
        icon: "↓",
        from: shipment.from,
        to: shipment.to,
        qty: shipment.qty,
        text: `${roleName(shipment.to)} 到仓 ${qty(shipment.qty)}${shipment.seeded ? "（开局在途）" : ""}；现在才成为可用现货。`
      });
    });
    game.supplyShipments = remaining;
  }

  function advanceProduction(events) {
    const remaining = [];
    game.productionJobs.forEach((job) => {
      job.eta -= 1;
      if (job.eta > 0) {
        remaining.push(job);
        return;
      }
      const order = findPurchaseOrder(job.purchaseOrderId);
      if (!order) throw new Error(`Missing purchase order for production ${job.id}`);
      order.remainingToShip -= job.qty;
      order.shippedQty += job.qty;
      game.supplyShipments.push(createSupplyShipment(PRODUCER, job.to, job.qty, order.shipmentLead, game.week, job.purchaseOrderId, false));
      events.push({
        kind: "production",
        icon: "⚙",
        qty: job.qty,
        text: `原料源完成 ${qty(job.qty)} 生产，并发往工厂；仍需 ${order.shipmentLead} 周到仓${order.expedited ? "（加急）" : ""}。`
      });
    });
    game.productionJobs = remaining;
  }

  function advanceOrderMessages(events) {
    const remaining = [];
    game.orderMessages.forEach((message) => {
      message.eta -= 1;
      if (message.eta > 0) {
        remaining.push(message);
        return;
      }
      const order = findPurchaseOrder(message.purchaseOrderId);
      if (!order) throw new Error(`Missing purchase order for signal ${message.id}`);
      order.supplierReceivedWeek = game.week;
      if (message.to === PRODUCER) {
        game.productionJobs.push(createProductionJob(message.qty, order.id));
        events.push({
          kind: "production-order",
          icon: "⚙",
          qty: message.qty,
          text: `原料源收到工厂的 ${qty(message.qty)} 补给单，进入 ${CONFIG.productionLead} 周生产队列。`
        });
      } else {
        addDemandLine(message.to, message.qty, message.from, order.id, "purchase-order", null);
        events.push({
          kind: "signal",
          icon: "✉",
          from: message.from,
          to: message.to,
          qty: message.qty,
          text: `${roleName(message.to)} 收到 ${roleName(message.from)} 的 ${qty(message.qty)} 补货订单。`
        });
      }
    });
    game.orderMessages = remaining;
  }

  function addWeeklyDemand(events) {
    const retailDemand = game.demandPlan[game.week - 1] || 0;
    const salesOrder = createCustomerOrder(retailDemand);
    game.customerDemand += retailDemand;
    game.terminalDemandHistory.push(retailDemand);
    addDemandLine(0, retailDemand, CUSTOMER, null, "customer", salesOrder.id);
    events.push({
      kind: "demand",
      icon: "●",
      qty: retailDemand,
      text: `客户本周新增 ${qty(retailDemand)} 订单；若没有现货，会进入待发背单。`
    });

    // Historic flows keep every link moving at the opening. They are not added
    // to the player's PO ledger and therefore never double-count the supply line.
    if (game.week <= CONFIG.orderLead) {
      for (let index = 1; index < ROLES.length; index += 1) {
        addDemandLine(index, CONFIG.initialFlow, index - 1, null, "opening-flow", null);
      }
      game.supplyShipments.push(createSupplyShipment(PRODUCER, 3, CONFIG.initialFlow, CONFIG.shipmentLead, game.week, null, true));
    }
  }

  function shipPurchaseOrder(stageIndex, line, amount) {
    const order = line.purchaseOrderId ? findPurchaseOrder(line.purchaseOrderId) : null;
    if (!order && line.source !== "opening-flow") throw new Error(`Missing purchase order for demand ${line.id}`);
    const shipmentLead = order ? order.shipmentLead : CONFIG.shipmentLead;
    game.supplyShipments.push(createSupplyShipment(stageIndex, line.buyer, amount, shipmentLead, game.week, line.purchaseOrderId, false));
    if (!order) return;
    order.remainingToShip -= amount;
    order.shippedQty += amount;
  }

  function shipCustomerOrder(line, amount) {
    const order = findCustomerOrder(line.customerOrderId);
    if (!order) throw new Error(`Missing customer order for demand ${line.id}`);
    order.remainingToShip -= amount;
    order.shippedQty += amount;
    game.customerDispatched += amount;
    game.customerShipments.push(createCustomerShipment(amount, CONFIG.customerDeliveryLead, line.customerOrderId));
  }

  function fulfillStage(stageIndex, events) {
    const stage = game.stages[stageIndex];
    const beforeBacklog = stage.backlog;
    let sent = 0;
    while (stage.onHand > 0 && stage.pendingDemand.length > 0) {
      const line = stage.pendingDemand[0];
      const sentNow = Math.min(stage.onHand, line.qty);
      stage.onHand -= sentNow;
      line.qty -= sentNow;
      sent += sentNow;

      if (line.buyer === CUSTOMER) {
        shipCustomerOrder(line, sentNow);
      } else {
        shipPurchaseOrder(stageIndex, line, sentNow);
      }
      if (line.qty === 0) stage.pendingDemand.shift();
    }
    stage.dispatchedThisWeek = sent;
    stage.backlog = stage.pendingDemand.reduce((sum, line) => sum + line.qty, 0);

    if (sent > 0) {
      if (stageIndex === 0) {
        events.push({
          kind: "customer-dispatch",
          icon: "▣",
          qty: sent,
          text: `零售商本周向客户发运 ${qty(sent)}；客户将在 ${CONFIG.customerDeliveryLead} 周后签收。`
        });
      } else {
        const receiver = roleName(stageIndex - 1);
        events.push({
          kind: "dispatch",
          icon: "▣",
          qty: sent,
          text: `${roleName(stageIndex)} 本周向${receiver}发运 ${qty(sent)}；到仓周次请看货物流队列。`
        });
      }
    }
    if (stage.backlog > 0) {
      events.push({
        kind: "backlog",
        icon: "!",
        qty: stage.backlog,
        text: `${roleName(stageIndex)} 仍有 ${qty(stage.backlog)} 待发背单；在途货不能立刻清除它。`
      });
    } else if (beforeBacklog > 0) {
      events.push({ kind: "clear", icon: "✓", text: `${roleName(stageIndex)} 已清掉历史待发订单。` });
    }
  }

  function supplyBreakdown(stageIndex) {
    const message = game.orderMessages
      .filter((item) => item.from === stageIndex)
      .reduce((sum, item) => sum + item.qty, 0);
    const awaiting = game.purchaseOrders
      .filter((order) => order.buyer === stageIndex && order.supplierReceivedWeek !== null)
      .reduce((sum, order) => sum + order.remainingToShip, 0);
    const shipping = game.supplyShipments
      .filter((shipment) => shipment.to === stageIndex)
      .reduce((sum, shipment) => sum + shipment.qty, 0);
    return { message, awaiting, shipping, total: message + awaiting + shipping };
  }

  function assertLedger() {
    const supplyInTransitFor = (purchaseOrderId) => game.supplyShipments
      .filter((shipment) => shipment.purchaseOrderId === purchaseOrderId)
      .reduce((sum, shipment) => sum + shipment.qty, 0);
    const deliveryInTransitFor = (customerOrderId) => game.customerShipments
      .filter((shipment) => shipment.customerOrderId === customerOrderId)
      .reduce((sum, shipment) => sum + shipment.qty, 0);

    game.purchaseOrders.forEach((order) => {
      const shippedAndRemaining = order.shippedQty + order.remainingToShip;
      const receivedAndTransit = order.receivedQty + supplyInTransitFor(order.id);
      if (order.total !== shippedAndRemaining || order.shippedQty !== receivedAndTransit) {
        throw new Error(`Purchase order ledger mismatch: ${order.id}`);
      }
    });
    game.customerOrders.forEach((order) => {
      const shippedAndRemaining = order.shippedQty + order.remainingToShip;
      const deliveredAndTransit = order.deliveredQty + deliveryInTransitFor(order.id);
      if (order.total !== shippedAndRemaining || order.shippedQty !== deliveredAndTransit) {
        throw new Error(`Customer order ledger mismatch: ${order.id}`);
      }
    });
    game.stages.forEach((stage) => {
      const queuedDemand = stage.pendingDemand.reduce((sum, line) => sum + line.qty, 0);
      if (stage.backlog !== queuedDemand) throw new Error(`Backlog ledger mismatch at stage ${stage.index}`);
    });
  }

  function inboundShipments(stageIndex) {
    return game.supplyShipments
      .filter((shipment) => shipment.to === stageIndex)
      .sort((a, b) => a.eta - b.eta || a.id.localeCompare(b.id));
  }

  function outboundMessages(stageIndex) {
    return game.orderMessages
      .filter((message) => message.from === stageIndex)
      .sort((a, b) => a.eta - b.eta || a.id.localeCompare(b.id));
  }

  function customerShipments() {
    return game.customerShipments
      .slice()
      .sort((a, b) => a.eta - b.eta || a.id.localeCompare(b.id));
  }

  function outboundShipments(stageIndex) {
    if (stageIndex === 0) return customerShipments();
    return game.supplyShipments
      .filter((shipment) => shipment.from === stageIndex)
      .sort((a, b) => a.eta - b.eta || a.id.localeCompare(b.id));
  }

  function quantityAtEta(items, eta) {
    return items
      .filter((item) => item.eta === eta)
      .reduce((sum, item) => sum + item.qty, 0);
  }

  function laterQuantity(items, afterEta) {
    return items
      .filter((item) => item.eta > afterEta)
      .reduce((sum, item) => sum + item.qty, 0);
  }

  function nextWeekMarkup(index, shipments) {
    const inbound = quantityAtEta(shipments, 1);
    const outbound = quantityAtEta(outboundShipments(index), 1);
    const outboundLabel = index === 0 ? "客户签收" : "下游到仓";
    return `<div class="next-week-strip"><strong>W+1</strong><span>上游到仓 <b>${qty(inbound)}</b></span><span>${outboundLabel} <b>${qty(outbound)}</b></span></div>`;
  }

  function signalQueueMarkup(messages) {
    const w1 = quantityAtEta(messages, 1);
    const w2 = quantityAtEta(messages, 2);
    const later = laterQuantity(messages, 2);
    return `<div class="signal-queue"><strong>补货信号队列</strong><span>W+1 <b>${qty(w1)}</b></span><span>W+2 <b>${qty(w2)}</b></span>${later ? `<span>W+3+ <b>${qty(later)}</b></span>` : ""}</div>`;
  }

  function orderPreviewText(index, inputValue) {
    const expedited = Boolean(game.expediteDrafts[index] && CONFIG.expediteEnabled);
    const eta = game.week + arrivalLeadWeeks(index, expedited);
    const expediteText = expedited ? `；加急运输 ${expeditedShipmentLead(CONFIG)} 周，另加 ${money(inputValue * CONFIG.expediteCost)}` : "";
    return `今天下的 ${inputValue} 箱，最快第 ${eta} 周到仓${expediteText}。`;
  }

  function forecastHistory(stageIndex) {
    if (game.recommendationMode === "shared") return game.terminalDemandHistory;
    return game.stages[stageIndex].demandHistory;
  }

  function getForecast(stageIndex) {
    const history = forecastHistory(stageIndex).slice(-3);
    return Math.max(1, Math.round(average(history)));
  }

  function protectionWeeks(stageIndex) {
    return CONFIG.orderLead + CONFIG.shipmentLead + CONFIG.reviewWeeks + (stageIndex === 3 ? CONFIG.productionLead : 0);
  }

  function arrivalLeadWeeks(stageIndex, expedited) {
    const shipmentLead = expedited && CONFIG.expediteEnabled ? expeditedShipmentLead(CONFIG) : CONFIG.shipmentLead;
    return CONFIG.orderLead + shipmentLead + (stageIndex === 3 ? CONFIG.productionLead : 0);
  }

  function getRecommendation(stageIndex) {
    const stage = game.stages[stageIndex];
    const supply = supplyBreakdown(stageIndex);
    const history = forecastHistory(stageIndex);
    const forecast = getForecast(stageIndex);
    const demandVolatility = standardDeviation(history.slice(-4));
    const protection = protectionWeeks(stageIndex);
    const safety = Math.max(forecast, Math.ceil(demandVolatility * Math.sqrt(protection)));
    const target = forecast * protection + safety;
    const position = stage.onHand - stage.backlog + supply.total;
    return {
      stageIndex,
      forecastSource: game.recommendationMode === "shared" ? "terminal" : "local",
      onHand: stage.onHand,
      backlog: stage.backlog,
      forecast,
      safety,
      protection,
      target,
      position,
      supply,
      suggested: clamp(Math.max(0, Math.round(target - position)), 0, CONFIG.maxOrder)
    };
  }

  function beginWeek() {
    if (game.week >= CONFIG.rounds) {
      finishGame();
      return;
    }
    game.phase = "opening";
    game.week += 1;
    const events = [];
    game.stages.forEach((stage) => {
      stage.openingOnHand = stage.onHand;
      stage.receivedThisWeek = 0;
      stage.dispatchedThisWeek = 0;
      stage.arrivalsThisWeek = 0;
      stage.customerDeliveredThisWeek = 0;
    });

    // The order is the rule of the game: what arrives first can be allocated
    // this week; what departs this week cannot arrive or be signed this week.
    advanceCustomerShipments(events);
    advanceSupplyShipments(events);
    advanceProduction(events);
    advanceOrderMessages(events);
    addWeeklyDemand(events);
    game.stages.forEach((_, index) => fulfillStage(index, events));
    game.stages.forEach((stage) => stage.demandHistory.push(stage.receivedThisWeek));
    assertLedger();

    game.recommendations = game.stages.map((_, index) => getRecommendation(index));
    game.drafts = game.stages.map((stage, index) => {
      if (game.mode === "learn" && index !== game.playerIndex) return null;
      return clamp(stage.lastOrder, 0, CONFIG.maxOrder);
    });
    game.events = events;
    game.phase = "decision";
    render();
  }

  function controlledByPlayer(index) {
    return game.mode === "sandbox" || index === game.playerIndex;
  }

  function closeWeek() {
    if (!game || game.phase !== "decision") return;
    const run = ++sequence;
    game.phase = "resolving";
    const events = game.events.slice();
    const decisions = [];

    let expediteCost = 0;
    const stageExpediteCosts = ROLES.map(() => 0);
    game.stages.forEach((stage, index) => {
      const recommendation = game.recommendations[index] || getRecommendation(index);
      const raw = controlledByPlayer(index) ? game.drafts[index] : recommendation.suggested;
      const orderQty = clamp(Number.isFinite(Number(raw)) ? Math.round(Number(raw)) : 0, 0, CONFIG.maxOrder);
      const expedited = controlledByPlayer(index) && Boolean(game.expediteDrafts[index]);
      stage.lastOrder = orderQty;
      decisions[index] = orderQty;
      if (orderQty > 0) {
        const order = createPurchaseOrder(index, orderQty, expedited);
        const earliest = game.week + arrivalLeadWeeks(index, order.expedited);
        expediteCost += order.expediteFee;
        stageExpediteCosts[index] += order.expediteFee;
        events.push({
          kind: "placed",
          icon: "✉",
          qty: orderQty,
          from: index,
          text: `${roleName(index)} 提交 ${qty(orderQty)} 补货单；最快第 ${earliest} 周到仓${order.expedited ? `（加急费 ${money(order.expediteFee)}）` : ""}。`
        });
      } else {
        events.push({ kind: "placed", icon: "—", from: index, text: `${roleName(index)} 本周未新增补货。` });
      }
    });
    assertLedger();

    const stageCosts = game.stages.map((stage) => stage.onHand * CONFIG.holdingCost + stage.backlog * CONFIG.backlogCost);
    const weekCost = stageCosts.reduce((sum, value) => sum + value, 0) + expediteCost;
    game.totalCost += weekCost;
    const expediteCostText = expediteCost ? `，含加急费 ${money(expediteCost)}` : "";
    events.push({ kind: "cost", icon: "¥", text: `本周库存、背单与运输成本 ${money(weekCost)}${expediteCostText}；累计 ${money(game.totalCost)}。` });
    game.history.push({
      week: game.week,
      demand: game.demandPlan[game.week - 1],
      orders: decisions.slice(),
      suggestions: game.recommendations.map((item) => item.suggested),
      received: game.stages.map((stage) => stage.receivedThisWeek),
      inventories: game.stages.map((stage) => stage.onHand),
      backlogs: game.stages.map((stage) => stage.backlog),
      arrivals: game.stages.map((stage) => stage.arrivalsThisWeek),
      dispatches: game.stages.map((stage) => stage.dispatchedThisWeek),
      stageCosts,
      stageExpediteCosts,
      customerDispatched: game.stages[0].dispatchedThisWeek,
      customerDelivered: game.stages[0].customerDeliveredThisWeek,
      expediteCost,
      cost: weekCost
    });
    game.events = events;
    render();

    const delay = game.fast ? 80 : 850;
    pause(delay, run).then((current) => {
      if (!current || !game || game.phase !== "resolving") return;
      if (game.week >= CONFIG.rounds) finishGame();
      else beginWeek();
    });
  }

  function visibleToPlayer(index) {
    return game.mode === "sandbox" || revealNetwork || index === game.playerIndex;
  }

  function htmlToken(item, type, hidden) {
    if (hidden) return '<span class="eta-token ghost">? 箱</span>';
    const icon = type === "order" ? "✉" : "▣";
    return `<span class="eta-token ${type === "order" ? "order" : ""}"><span class="token-icon">${icon}</span>${item.qty}</span>`;
  }

  function etaSlots(items, type, hidden) {
    const content = [1, 2].map((eta) => {
      const eligible = items.filter((item) => item.eta === eta);
      return `<div class="eta-slot ${type === "order" ? "order-slot" : ""}"><span class="eta-caption">W+${eta}</span>${eligible.length ? eligible.map((item) => htmlToken(item, type, hidden)).join("") : '<span class="eta-token ghost">—</span>'}</div>`;
    }).join("");
    const later = items.filter((item) => item.eta > 2).reduce((sum, item) => sum + item.qty, 0);
    return `<div class="eta-row">${content}</div>${later ? `<small class="eta-later">W+3 以后还有 ${qty(later)}</small>` : ""}`;
  }

  function statMarkup(label, value, danger) {
    return `<div class="mini-stat ${danger ? "danger" : ""}"><span>${label}</span><b>${value}</b></div>`;
  }

  function stageMarkup(index) {
    const stage = game.stages[index];
    const role = ROLES[index];
    const controlled = controlledByPlayer(index);
    const rec = game.recommendations[index] || getRecommendation(index);
    const supply = supplyBreakdown(index);
    const shipments = inboundShipments(index);
    const messages = outboundMessages(index);
    const inputValue = game.drafts[index] ?? rec.suggested;
    const customerTransit = index === 0 ? customerShipments().reduce((sum, shipment) => sum + shipment.qty, 0) : 0;
    const inboundLabel = stage.arrivalsThisWeek > 0 ? `本周到仓 ${qty(stage.arrivalsThisWeek)}` : "到仓才可用";
    const weeklyLedger = `期初 ${qty(stage.openingOnHand)} + 到仓 ${qty(stage.arrivalsThisWeek)} − 发运 ${qty(stage.dispatchedThisWeek)} = ${qty(stage.onHand)}`;
    const stats = index === 0
      ? [
        statMarkup("新增需求", qty(stage.receivedThisWeek)),
        statMarkup("本周发运", qty(stage.dispatchedThisWeek)),
        statMarkup("客户签收", qty(stage.customerDeliveredThisWeek)),
        statMarkup("可用现货", qty(stage.onHand)),
        statMarkup("客户背单", qty(stage.backlog), stage.backlog > 0)
      ]
      : [
        statMarkup("本周接单", qty(stage.receivedThisWeek)),
        statMarkup("本周发运", qty(stage.dispatchedThisWeek)),
        statMarkup("本周到仓", qty(stage.arrivalsThisWeek)),
        statMarkup("可用现货", qty(stage.onHand)),
        statMarkup("待发背单", qty(stage.backlog), stage.backlog > 0)
      ];
    const expedited = Boolean(game.expediteDrafts[index] && CONFIG.expediteEnabled);
    const expediteControl = CONFIG.expediteEnabled ? `<label class="expedite-choice"><input id="expedite-${index}" type="checkbox" ${expedited ? "checked" : ""}><span>本单加急运输</span><em>${expedited ? `运输 ${expeditedShipmentLead(CONFIG)} 周 · +${money(inputValue * CONFIG.expediteCost)}` : `缩短 ${CONFIG.expediteReduction} 周 · ${money(CONFIG.expediteCost)}/箱`}</em></label>` : "";
    const control = game.mode === "sandbox" ? "" : controlled ? `
      <div class="order-control">
        <label for="order-${index}"><span>本周向上游补货</span><strong class="order-value" id="orderValue-${index}">${inputValue} 箱</strong></label>
        <div class="order-inputs"><input class="order-range" id="order-${index}" type="range" min="0" max="${CONFIG.maxOrder}" value="${inputValue}" aria-label="${role.name}本周订货量滑杆"><input class="order-number" id="orderNumber-${index}" type="number" min="0" max="${CONFIG.maxOrder}" step="1" value="${inputValue}" inputmode="numeric" aria-label="${role.name}本周订货量直接输入"></div>
        ${expediteControl}
        <p class="order-preview" id="orderPreview-${index}">${orderPreviewText(index, inputValue)}</p>
      </div>` : `
      <div class="order-control"><p class="order-preview">AI 依照${rec.forecastSource === "terminal" ? "共享终端需求" : "本地接到的订单"}、库存位置和保护期，建议补货 ${qty(rec.suggested)}。</p></div>`;
    const guideMarker = index === game.playerIndex ? ' data-guide-target="inventory"' : "";

    return `<article class="stage-card ${controlled ? "player-card" : ""} ${game.phase === "decision" ? "entered" : ""}">
      <div class="stage-title"><h3><i class="role-dot" style="background:${role.color}"></i>${role.name}</h3><span class="role-tag">${controlled ? "你在管理" : "AI 管理"}</span></div>
      <div class="private-panel">
        <div class="stage-stats">${stats.join("")}</div>
        <div class="inventory-position"${guideMarker}>库存位置 <b>${qty(rec.position)}</b></div>
        <div class="weekly-ledger"><span>本周现货账</span><b>${weeklyLedger}</b><em>接单未发 = 背单</em></div>
        ${index === 0 ? `<div class="delivery-strip"><span>客户配送中 <b>${qty(customerTransit)}</b></span><em>已发运，非库存</em></div>` : ""}
        ${nextWeekMarkup(index, shipments)}
        ${signalQueueMarkup(messages)}
        <div class="pipeline-block pipeline-detail"><div class="pipeline-label"><span>上游已发货</span><em>${inboundLabel}</em></div>${etaSlots(shipments, "shipment", false)}</div>
        <div class="pipeline-block pipeline-detail"><div class="pipeline-label"><span>补货订单信号</span><em>不是货</em></div>${etaSlots(messages, "order", false)}</div>
        <div class="inventory-position supply-summary">信号中 ${qty(supply.message)} · 上游待发/生产 ${qty(supply.awaiting)} · 补给运输中 ${qty(supply.shipping)}</div>
        ${control}
      </div>
    </article>`;
  }

  function renderStages() {
    const indexes = game.mode === "learn" ? [game.playerIndex] : ROLES.map((_, index) => index);
    ui.stages.dataset.mode = game.mode;
    ui.stages.innerHTML = indexes.map((index) => stageMarkup(index)).join("");
    indexes.forEach((index) => {
      const rangeInput = $(`order-${index}`);
      const numberInput = $(`orderNumber-${index}`);
      if (!rangeInput || !numberInput) return;
      const updateDraft = (rawValue) => {
        const parsed = Number(rawValue);
        const nextValue = clamp(Number.isFinite(parsed) ? Math.round(parsed) : 0, 0, CONFIG.maxOrder);
        game.drafts[index] = nextValue;
        rangeInput.value = String(nextValue);
        numberInput.value = String(nextValue);
        const value = $(`orderValue-${index}`);
        if (value) value.textContent = `${nextValue} 箱`;
        const preview = $(`orderPreview-${index}`);
        if (preview) preview.textContent = orderPreviewText(index, nextValue);
        renderCoach();
        renderAction();
      };
      rangeInput.addEventListener("input", () => updateDraft(rangeInput.value));
      numberInput.addEventListener("input", () => {
        if (numberInput.value !== "") updateDraft(numberInput.value);
      });
      numberInput.addEventListener("change", () => updateDraft(numberInput.value));
      const expediteInput = $(`expedite-${index}`);
      if (expediteInput) {
        expediteInput.addEventListener("change", () => {
          game.expediteDrafts[index] = expediteInput.checked;
          renderStages();
          renderCoach();
          renderAction();
        });
      }
    });
  }

  function mapToken(items, flow, hidden) {
    if (hidden) return '<span class="map-token hidden-token">局部可见</span>';
    if (!items.length) return '<span class="map-token hidden-token">W+1 —</span>';
    const total = items.reduce((sum, item) => sum + item.qty, 0);
    const w1 = quantityAtEta(items, 1);
    const w2 = quantityAtEta(items, 2);
    const later = laterQuantity(items, 2);
    const glyph = flow === "order" ? "✉" : "▣";
    const future = w2 ? ` · W+2 ${w2}` : later ? ` · W+3+ ${later}` : "";
    const title = `合计 ${total} 箱：W+1 ${w1} 箱${w2 ? `；W+2 ${w2} 箱` : ""}${later ? `；W+3 以后 ${later} 箱` : ""}`;
    return `<span class="map-token ${flow === "order" ? "order" : "shipment"}" title="${title}">${glyph} W+1 ${w1}${future}</span>`;
  }

  function mapCustomerDemandToken() {
    const visible = game.mode === "sandbox" || revealNetwork || game.playerIndex === 0;
    if (!visible) return '<span class="map-token hidden-token">局部可见</span>';
    return `<span class="map-token order">● ${game.stages[0].receivedThisWeek} 本周生效</span>`;
  }

  function mapNodes(flow) {
    const customerToken = flow === "order"
      ? mapCustomerDemandToken()
      : mapToken(customerShipments(), "shipment", !(game.mode === "sandbox" || revealNetwork || game.playerIndex === 0));
    const customer = `<div class="map-node customer"><strong>客户</strong>${customerToken}</div>`;
    const stages = ROLES.map((role, index) => {
      const hidden = !visibleToPlayer(index);
      const items = flow === "order" ? outboundMessages(index) : inboundShipments(index);
      return `<div class="map-node ${index === game.playerIndex ? "active" : ""} ${index === 3 ? "factory" : ""}"><strong>${role.short}</strong>${mapToken(items, flow, hidden)}</div>`;
    }).join("");
    return `${customer}${stages}`;
  }

  function renderSystemMap() {
    const flowMarkup = (flow, title, glyph) => `
      <div class="map-flow flow-${flow}">
        <div class="map-flow-label"><span class="flow-glyph">${glyph}</span><span>${title}</span></div>
        <div class="map-chain">${mapNodes(flow)}</div>
      </div>`;
    const focus = game.playerIndex;
    const messages = outboundMessages(focus);
    const shipments = inboundShipments(focus);
    const customerTransit = customerShipments();
    const stage = game.stages[focus];
    const ruleNote = "本周订单已生效：有现货立即发；无现货才进入背单。";
    let detail = "每格先看 W+1，判断下周会到的货与会签收的货。";
    if (stage.backlog > 0) {
      detail = `${ROLES[focus].name} 有 ${qty(stage.backlog)} 待发背单；先到的库存会优先处理较早订单。`;
    } else if (messages.length) {
      const soonest = Math.min(...messages.map((item) => item.eta));
      detail = `${ROLES[focus].name} 的补货订单还要 ${soonest} 周才被上游看见；它不是现货。`;
    } else if (shipments.length) {
      const soonest = Math.min(...shipments.map((item) => item.eta));
      detail = `${ROLES[focus].name} 有 ${qty(shipments.reduce((sum, item) => sum + item.qty, 0))} 已发货补给，最近 W+${soonest} 到仓。`;
    } else if (focus === 0 && customerTransit.length) {
      const soonest = Math.min(...customerTransit.map((item) => item.eta));
      detail = `已有 ${qty(customerTransit.reduce((sum, item) => sum + item.qty, 0))} 发往客户；它们 W+${soonest} 签收，已不属于零售库存。`;
    }
    ui.systemMap.innerHTML = `${flowMarkup("order", `订单信号 · ${CONFIG.orderLead}周`, "✉")}${flowMarkup("shipment", `货物流 · ${CONFIG.shipmentLead}周`, "▣")}<p class="map-state-note">${ruleNote} ${detail}</p>`;
  }

  function shortHorizonMarkup(recommendation) {
    const stage = game.stages[recommendation.stageIndex];
    const shipments = inboundShipments(recommendation.stageIndex);
    let projected = stage.onHand - stage.backlog;
    const rows = [1, 2].map((horizon) => {
      const arrival = shipments
        .filter((shipment) => shipment.eta === horizon)
        .reduce((sum, shipment) => sum + shipment.qty, 0);
      const opening = horizon === 1 ? `现货 ${qty(stage.onHand)} − 背单 ${qty(stage.backlog)}` : `W+${horizon - 1} 余量 ${qty(projected)}`;
      projected += arrival - recommendation.forecast;
      return `<div class="math-label">W+${horizon} 预计可用</div><div class="math-value">${opening} + 到货 ${qty(arrival)} − 预测 ${qty(recommendation.forecast)} = ${qty(projected)}</div>`;
    }).join("");
    return `
      <div class="math-total hand-calc-title"><span>短期手算：先预警会不会缺货</span><span>只算已发货在途</span></div>
      ${rows}
      <div class="math-note">本周接单不再单独扣减：已发的已经计入“发运”，未发的只通过“背单”扣一次。订单信号、待发/生产和运输中的补给仍要计入库存头寸，避免重复下单。</div>`;
  }

  function formulaMarkup(recommendation, compact) {
    const role = ROLES[recommendation.stageIndex];
    const supply = recommendation.supply;
    if (compact) {
      return `<div class="coach-mini"><b>${role.name}</b><span>库存位置 ${recommendation.position} / 目标 ${recommendation.target}</span><strong>建议 ${recommendation.suggested} 箱</strong></div>`;
    }
    const stage = game.stages[recommendation.stageIndex];
    const forecastLabel = recommendation.forecastSource === "terminal" ? "共享终端需求预测（最近 3 周）" : "最近 3 周接到订单预测";
    const strategyNote = recommendation.forecastSource === "terminal"
      ? '<div class="math-note">协同模式共享的是终端需求数据；补货订单与货物仍要分别经过信号、生产和运输周期。</div>'
      : "";
    return `
      <div class="math-label">本周现货账</div><div class="math-value">期初 ${qty(stage.openingOnHand)} + 到仓 ${qty(stage.arrivalsThisWeek)} − 发运 ${qty(stage.dispatchedThisWeek)} = ${qty(stage.onHand)}</div>
      <div class="math-label">可用现货</div><div class="math-value">${qty(recommendation.onHand)}</div>
      <div class="math-label">− 待发背单</div><div class="math-value">− ${qty(recommendation.backlog)}</div>
      <div class="math-label">+ 订单信号传递中</div><div class="math-value">+ ${qty(supply.message)}</div>
      <div class="math-label">+ 上游待发 / 生产中</div><div class="math-value">+ ${qty(supply.awaiting)}</div>
      <div class="math-label">+ 上游已发货运输中</div><div class="math-value">+ ${qty(supply.shipping)}</div>
      <div class="math-total"><span>当前库存位置</span><span>${qty(recommendation.position)}</span></div>
      <div class="math-label">${forecastLabel}</div><div class="math-value">${qty(recommendation.forecast)} / 周</div>
      <div class="math-label">保护期（处理 + 生产/运输 + 复盘）</div><div class="math-value">${recommendation.protection} 周</div>
      <div class="math-label">安全库存</div><div class="math-value">${qty(recommendation.safety)}</div>
      <div class="math-total"><span>目标库存 / 建议补货</span><span>${qty(recommendation.target)} / ${qty(recommendation.suggested)}</span></div>
      ${strategyNote}
      ${shortHorizonMarkup(recommendation)}`;
  }

  function renderSandboxDirectControls() {
    ui.coachCard.classList.add("sandbox-coach");
    ui.sandboxDirectControls.hidden = false;
    ui.sandboxDirectControls.innerHTML = game.stages.map((_, index) => {
      const role = ROLES[index];
      const value = game.drafts[index] ?? game.recommendations[index].suggested;
      const expedite = CONFIG.expediteEnabled ? `<label class="sandbox-expedite"><input type="checkbox" data-sandbox-expedite="${index}" ${game.expediteDrafts[index] ? "checked" : ""}><span>加急</span></label>` : "";
      return `<section class="sandbox-direct-control" data-sandbox-control="${index}">
        <div class="sandbox-control-heading"><span>${role.short}</span><output data-sandbox-output="${index}">${value} 箱</output>${expedite}</div>
        <div class="sandbox-control-actions"><button type="button" data-sandbox-step="-1" data-sandbox-index="${index}" aria-label="${role.name}订货量减一箱">−</button><input type="range" min="0" max="${CONFIG.maxOrder}" value="${value}" data-sandbox-range="${index}" aria-label="${role.name}本周订货量滑杆"><button type="button" data-sandbox-step="1" data-sandbox-index="${index}" aria-label="${role.name}订货量加一箱">+</button></div>
      </section>`;
    }).join("");
    const setSandboxDraft = (index, rawValue) => {
      const parsed = Number(rawValue);
      const nextValue = clamp(Number.isFinite(parsed) ? Math.round(parsed) : 0, 0, CONFIG.maxOrder);
      game.drafts[index] = nextValue;
      const range = ui.sandboxDirectControls.querySelector(`[data-sandbox-range="${index}"]`);
      const output = ui.sandboxDirectControls.querySelector(`[data-sandbox-output="${index}"]`);
      if (range) range.value = String(nextValue);
      if (output) output.textContent = `${nextValue} 箱`;
      renderAction();
    };
    ui.sandboxDirectControls.querySelectorAll("input[data-sandbox-range]").forEach((input) => {
      input.addEventListener("input", () => setSandboxDraft(Number(input.dataset.sandboxRange), input.value));
    });
    ui.sandboxDirectControls.querySelectorAll("button[data-sandbox-step]").forEach((button) => {
      button.addEventListener("click", () => {
        const index = Number(button.dataset.sandboxIndex);
        setSandboxDraft(index, Number(game.drafts[index]) + Number(button.dataset.sandboxStep));
      });
    });
    ui.sandboxDirectControls.querySelectorAll("input[data-sandbox-expedite]").forEach((input) => {
      input.addEventListener("change", () => {
        game.expediteDrafts[Number(input.dataset.sandboxExpedite)] = input.checked;
        renderAction();
      });
    });
  }

  function renderCoach() {
    const focus = game.playerIndex;
    const recommendation = game.recommendations[focus] || getRecommendation(focus);
    if (game.mode === "sandbox") {
      ui.coachTitle.textContent = "四个环节分别滑动或用 ± 设定补货";
      ui.coachSummary.textContent = game.recommendationMode === "shared"
        ? "建议共享同一份终端需求；库存位置与补货信号仍分别计算，确认后四笔订单进入各自队列。"
        : "每个角色只对自己的库存位置和最近接单下单；确认时四笔补货一起进入各自的信号队列。";
      ui.coachMath.innerHTML = `<div class="math-header"><strong>各环节库存位置</strong><button class="math-close" type="button" data-close-math>收起手算</button></div><div class="coach-sandbox-grid">${game.recommendations.map((item) => formulaMarkup(item, true)).join("")}</div>`;
      ui.apply.textContent = "采用全部建议";
      renderSandboxDirectControls();
    } else {
      ui.coachCard.classList.remove("sandbox-coach");
      ui.sandboxDirectControls.hidden = true;
      ui.sandboxDirectControls.innerHTML = "";
      const current = game.drafts[focus];
      const delta = Number(current) - recommendation.suggested;
      const stage = game.stages[focus];
      const ledger = `本周：期初 ${qty(stage.openingOnHand)} + 到仓 ${qty(stage.arrivalsThisWeek)} − 发运 ${qty(stage.dispatchedThisWeek)} = 现货 ${qty(stage.onHand)}`;
      ui.coachTitle.textContent = `${ROLES[focus].name}：先手算，再看库存头寸`;
      if (recommendation.suggested === 0) {
        ui.coachSummary.textContent = `${ledger}。供给线已有 ${qty(recommendation.position)}，目标为 ${qty(recommendation.target)}；现在追加会重复补货。`;
      } else if (Math.abs(delta) >= 3) {
        ui.coachSummary.textContent = `${ledger}。你的输入比建议${delta > 0 ? "多" : "少"} ${qty(Math.abs(delta))}；这项差异要等补给完成后才显现。`;
      } else {
        const forecastSource = recommendation.forecastSource === "terminal" ? "共享终端需求" : "本地接单";
        ui.coachSummary.textContent = `${ledger}。本周接单已通过发运或背单反映；按${forecastSource} ${qty(recommendation.forecast)} / 周预测，建议补 ${qty(recommendation.suggested)}。`;
      }
      ui.coachMath.innerHTML = `<div class="math-header"><strong>手算依据</strong><button class="math-close" type="button" data-close-math>收起手算</button></div>${formulaMarkup(recommendation, false)}`;
      ui.apply.textContent = `采用 ${recommendation.suggested} 箱建议`;
    }
    ui.coachMath.hidden = !coachOpen;
    ui.explain.textContent = coachOpen ? "收起手算" : "展开手算";
    const closeMath = ui.coachMath.querySelector("[data-close-math]");
    if (closeMath) closeMath.addEventListener("click", () => {
      coachOpen = false;
      renderCoach();
    });
  }

  function fillRate() {
    if (!game.customerDemand) return 1;
    return game.customerDispatched / game.customerDemand;
  }

  function bullwhipRatioFor(index) {
    if (game.history.length < 3) return null;
    const demand = game.history.map((item) => item.demand);
    const orders = game.history.map((item) => item.orders[index]);
    const demandVariance = variance(demand);
    if (demandVariance < 0.01) return null;
    return variance(orders) / demandVariance;
  }

  function bullwhipRatio() {
    return bullwhipRatioFor(game.playerIndex);
  }

  function sumHistory(field, index) {
    return game.history.reduce((sum, item) => sum + (item[field] && item[field][index] ? item[field][index] : 0), 0);
  }

  function stageSummary(index) {
    const received = sumHistory("received", index);
    const dispatched = sumHistory("dispatches", index);
    const latest = game.history[game.history.length - 1];
    return {
      index,
      received,
      dispatched,
      dispatchRate: received ? dispatched / received : 1,
      cost: sumHistory("stageCosts", index) + sumHistory("stageExpediteCosts", index),
      backlog: latest ? latest.backlogs[index] : 0,
      bullwhip: bullwhipRatioFor(index)
    };
  }

  function formatBullwhip(value) {
    return value === null ? "—" : `${value.toFixed(1)}×`;
  }

  function highestBullwhip(summaries) {
    const available = summaries.filter((item) => item.bullwhip !== null);
    if (!available.length) return null;
    return available.reduce((highest, item) => item.bullwhip > highest.bullwhip ? item : highest, available[0]);
  }

  function experimentSummary() {
    const roles = ROLES.map((_, index) => stageSummary(index));
    return {
      scenarioKey: game.scenarioKey,
      demandSeed: game.demandSeed,
      recommendationMode: game.recommendationMode,
      totalCost: game.totalCost,
      dispatchRate: fillRate(),
      deliveryRate: game.customerDemand ? game.customerDelivered / game.customerDemand : 1,
      roles,
      highestBullwhip: highestBullwhip(roles)
    };
  }

  function resultDecisionContext() {
    if (game.mode === "sandbox") return "全链沙盒：四个角色由你的输入决定；采用全部建议可用于策略 A/B。";
    return `教学：你管理${ROLES[game.playerIndex].name}，其他环节采用当前建议策略。`;
  }

  function signedChange(value, unit) {
    if (Math.abs(value) < 0.005) return "持平";
    const sign = value > 0 ? "+" : "−";
    return `${sign}${Math.abs(value).toFixed(unit === "%" ? 0 : 0)}${unit}`;
  }

  function renderToolbar() {
    ui.week.textContent = `第 ${Math.min(game.week, CONFIG.rounds)} / ${CONFIG.rounds} 周`;
    ui.cost.textContent = money(game.totalCost);
    ui.service.textContent = `${Math.round(fillRate() * 100)}%`;
    const ratio = bullwhipRatio();
    ui.bullwhip.textContent = ratio === null ? "观察中" : `${ratio.toFixed(1)}×`;
    ui.roleWrap.hidden = game.mode === "sandbox";
    ui.visibility.hidden = game.mode === "sandbox";
    ui.visibility.textContent = revealNetwork ? "隐藏全链" : "显示全链";
    ui.visibility.setAttribute("aria-pressed", String(revealNetwork));
  }

  function renderAction() {
    const active = game.phase === "decision";
    ui.submit.disabled = !active;
    if (game.phase === "resolving") {
      ui.decisionStatus.textContent = "订单与货物正在进入下一周…";
      ui.decisionDetail.textContent = "本周成本已结算；下一周会先签收、到货、接单和发运。";
      ui.submit.textContent = "推进中…";
      return;
    }
    if (game.phase === "ended") {
      ui.decisionStatus.textContent = "本轮实验结束";
      ui.decisionDetail.textContent = "查看复盘，找出哪一次补货决定被延迟放大。";
      ui.submit.textContent = "已结算";
      return;
    }
    const focus = game.playerIndex;
    const stage = game.stages[focus];
    const recommendation = game.recommendations[focus];
    const chosen = game.drafts[focus];
    ui.decisionStatus.textContent = game.mode === "sandbox" ? "四个环节等待本周补货决策" : `${ROLES[focus].name} 等待本周补货决策`;
    if (game.mode === "sandbox") {
      const orders = game.drafts.map((value, index) => `${ROLES[index].short} ${qty(value)}${game.expediteDrafts[index] ? " ⚡" : ""}`).join(" · ");
      const expediteNote = game.expediteDrafts.some(Boolean) ? " ⚡ 只缩短运输，不缩短信号或生产。" : "";
      ui.decisionDetail.textContent = `已填写：${orders}。四个数量会在确认时一起提交。${expediteNote}`;
      ui.submit.innerHTML = game.week === CONFIG.rounds ? "确认并结算 <span aria-hidden=\"true\">→</span>" : "确认并推进 <span aria-hidden=\"true\">→</span>";
      return;
    }
    ui.decisionDetail.textContent = `本周已发运 ${qty(stage.dispatchedThisWeek)}；建议 ${qty(recommendation.suggested)}，你的输入 ${qty(chosen)}，最快第 ${game.week + arrivalLeadWeeks(focus, game.expediteDrafts[focus])} 周到仓${game.expediteDrafts[focus] ? "（加急）" : ""}。`;
    ui.submit.innerHTML = game.week === CONFIG.rounds ? "确认并结算 <span aria-hidden=\"true\">→</span>" : "确认并推进 <span aria-hidden=\"true\">→</span>";
  }

  function drawChart() {
    const canvas = ui.chart;
    const rect = canvas.getBoundingClientRect();
    const width = Math.max(1, Math.floor(rect.width));
    const height = Math.max(1, Math.floor(rect.height));
    const dpr = window.devicePixelRatio || 1;
    canvas.width = width * dpr;
    canvas.height = height * dpr;
    const ctx = canvas.getContext("2d");
    ctx.scale(dpr, dpr);
    ctx.clearRect(0, 0, width, height);
    if (!game.history.length) {
      ctx.fillStyle = "#8292a5";
      ctx.font = "13px system-ui";
      ctx.textAlign = "center";
      ctx.fillText("完成第一周后，需求、订货、到货和背单会出现在这里。", width / 2, height / 2);
      return;
    }
    const index = game.playerIndex;
    const demand = game.history.map((item) => item.demand);
    const orders = game.history.map((item) => item.orders[index]);
    const arrivals = game.history.map((item) => item.arrivals[index]);
    const backlogs = game.history.map((item) => item.backlogs[index]);
    const maxValue = Math.max(10, ...demand, ...orders, ...arrivals, ...backlogs) * 1.15;
    const pad = { top: 20, right: 16, bottom: 30, left: 38 };
    const x = (position) => pad.left + (position / Math.max(1, game.history.length - 1)) * (width - pad.left - pad.right);
    const y = (value) => height - pad.bottom - (value / maxValue) * (height - pad.top - pad.bottom);
    ctx.font = "12px system-ui";
    ctx.fillStyle = "#8594a4";
    ctx.strokeStyle = "#e7edf3";
    ctx.lineWidth = 1;
    for (let tick = 0; tick <= 4; tick += 1) {
      const value = (maxValue * tick) / 4;
      const py = y(value);
      ctx.beginPath(); ctx.moveTo(pad.left, py); ctx.lineTo(width - pad.right, py); ctx.stroke();
      ctx.fillText(String(Math.round(value)), 4, py + 4);
    }
    const drawSeries = (series, color, dash, widthValue) => {
      ctx.beginPath();
      ctx.setLineDash(dash || []);
      ctx.strokeStyle = color;
      ctx.lineWidth = widthValue || 2;
      series.forEach((value, point) => {
        if (point === 0) ctx.moveTo(x(point), y(value));
        else ctx.lineTo(x(point), y(value));
      });
      ctx.stroke();
      ctx.setLineDash([]);
      if (!dash) {
        series.forEach((value, point) => {
          ctx.beginPath(); ctx.fillStyle = color; ctx.arc(x(point), y(value), 2.3, 0, Math.PI * 2); ctx.fill();
        });
      }
    };
    drawSeries(demand, "#8e9baa", [5, 4], 1.6);
    drawSeries(arrivals, "#2375e1", [2, 3], 1.8);
    drawSeries(backlogs, "#e25356", [4, 2], 1.8);
    drawSeries(orders, "#f0ad2c", null, 2.4);
    ctx.fillStyle = "#8292a5";
    ctx.textAlign = "center";
    game.history.forEach((item, point) => {
      if (point === 0 || point === game.history.length - 1 || item.week % 4 === 0) ctx.fillText(`W${item.week}`, x(point), height - 8);
    });

    const latest = game.history[game.history.length - 1];
    const biggest = game.history.reduce((best, item) => item.orders[index] > best.orders[index] ? item : best, game.history[0]);
    if (latest.backlogs[index] > 0) {
      ui.insight.textContent = `当前仍有 ${qty(latest.backlogs[index])} 待发背单。即使有补给在路上，它到仓前也无法服务今天的订单。`;
    } else if (biggest.orders[index] > biggest.demand + 3) {
      ui.insight.textContent = `W${biggest.week} 订货 ${qty(biggest.orders[index])}，真实需求只有 ${qty(biggest.demand)}。对照到货线，检查是否重复补货。`;
    } else {
      ui.insight.textContent = "观察需求、你的订货、实际到货和背单是否仍在同一节奏；延迟会让它们错开。";
    }
  }

  function renderGuide() {
    if (!ui.guideDialog.open) return;
    const step = GUIDE_STEPS[guideIndex];
    document.querySelectorAll(".guide-focus").forEach((element) => element.classList.remove("guide-focus"));
    const target = document.querySelector(`[data-guide-target="${step.target}"]`);
    if (target) target.classList.add("guide-focus");
    ui.guideProgress.textContent = `新手指南 ${guideIndex + 1} / ${GUIDE_STEPS.length}`;
    ui.guideTitle.textContent = step.title;
    ui.guideText.textContent = step.text;
    ui.guidePrevious.disabled = guideIndex === 0;
    ui.guideNext.textContent = guideIndex === GUIDE_STEPS.length - 1 ? "完成" : "下一步";
    window.requestAnimationFrame(() => positionGuide(target));
  }

  function positionGuide(target) {
    if (!target || !ui.guideDialog.open) return;
    const rect = target.getBoundingClientRect();
    const gap = 8;
    const spotlight = ui.guideSpotlight;
    spotlight.style.left = `${Math.max(4, rect.left - gap)}px`;
    spotlight.style.top = `${Math.max(4, rect.top - gap)}px`;
    spotlight.style.width = `${rect.width + gap * 2}px`;
    spotlight.style.height = `${rect.height + gap * 2}px`;
    const card = ui.guidePopover;
    const cardWidth = Math.min(320, window.innerWidth - 24);
    const x = clamp(rect.left, 12, Math.max(12, window.innerWidth - cardWidth - 12));
    let y = rect.bottom + 16;
    if (y + card.offsetHeight > window.innerHeight - 12) y = Math.max(12, rect.top - card.offsetHeight - 16);
    card.style.left = `${x}px`;
    card.style.top = `${y}px`;
  }

  function startGuide(manual) {
    if (!game) return;
    guideIndex = 0;
    guideOpener = document.activeElement;
    ui.guideSuppress.checked = false;
    ui.guideButton.setAttribute("aria-expanded", "true");
    if (!ui.guideDialog.open) {
      if (typeof ui.guideDialog.showModal === "function") ui.guideDialog.showModal();
      else ui.guideDialog.setAttribute("open", "");
    }
    renderGuide();
    if (manual) window.requestAnimationFrame(() => ui.guideNext.focus());
  }

  function closeGuide(completed) {
    document.querySelectorAll(".guide-focus").forEach((element) => element.classList.remove("guide-focus"));
    if (completed) safeWrite(GUIDE_COMPLETE_KEY, true);
    if (ui.guideSuppress.checked) safeWrite(GUIDE_SUPPRESS_KEY, true);
    if (ui.guideDialog.open) ui.guideDialog.close();
    ui.guideButton.setAttribute("aria-expanded", "false");
    if (guideOpener && typeof guideOpener.focus === "function") guideOpener.focus();
    else ui.guideButton.focus();
  }

  function maybeStartGuide() {
    if (guideAutoHandled || !game || game.mode !== "learn" || safeRead(GUIDE_COMPLETE_KEY) || safeRead(GUIDE_SUPPRESS_KEY)) return;
    guideAutoHandled = true;
    window.requestAnimationFrame(() => startGuide(false));
  }

  function render() {
    renderToolbar();
    renderSystemMap();
    renderStages();
    renderCoach();
    renderAction();
    drawChart();
    renderGuide();
  }

  function finishGame() {
    if (!game || game.phase === "ended") return;
    game.phase = "ended";
    render();
    const summary = experimentSummary();
    const ratio = summary.roles[game.playerIndex].bullwhip;
    const dispatchService = summary.dispatchRate * 100;
    const deliveryService = summary.deliveryRate * 100;
    const index = game.playerIndex;
    const largest = game.history.reduce((best, item) => item.orders[index] > best.orders[index] ? item : best, game.history[0]);
    const remainingSupply = game.stages.reduce((sum, _, stageIndex) => sum + supplyBreakdown(stageIndex).total, 0);
    const customerInTransit = customerShipments().reduce((sum, shipment) => sum + shipment.qty, 0);
    const bottleneck = summary.roles.reduce((largestBacklog, item) => item.backlog > largestBacklog.backlog ? item : largestBacklog, summary.roles[0]);
    const title = ratio === null ? "需求稳定，先看成本与库存" : ratio <= 1.4 ? "你让信号保持相对稳定" : ratio <= 3 ? "你看见了放大的开端" : "订单信号已经被放大";
    $("resultTitle").textContent = title;
    ui.resultIntro.textContent = game.recommendationMode === "shared"
      ? "本局用共享终端需求来预测；各环节的库存位置、背单和物理延迟仍然不同。"
      : "本局每个环节只根据本地接单预测；延迟会让为了“保险”的加单在未来叠加。";
    ui.resultContext.textContent = `情景 #${summary.demandSeed} · ${recommendationModeLabel(summary.recommendationMode)} · ${resultDecisionContext()}`;
    ui.resultMetrics.innerHTML = [
      ["全链累计成本", money(summary.totalCost)],
      ["零售发运率", `${dispatchService.toFixed(0)}%`],
      [`${ROLES[index].short}牛鞭`, formatBullwhip(ratio)]
    ].map(([label, value]) => `<div class="result-metric"><span>${label}</span><strong>${value}</strong></div>`).join("");
    ui.roleComparisonBody.innerHTML = summary.roles.map((item) => {
      const role = ROLES[item.index];
      return `<tr class="${item.index === game.playerIndex ? "is-current" : ""}">
        <td><span class="result-role-name"><i class="result-role-dot" style="background:${role.color}"></i>${role.name}</span><small class="result-role-note">期末背单 ${qty(item.backlog)}</small></td>
        <td>${(item.dispatchRate * 100).toFixed(0)}%</td>
        <td>${money(item.cost)}</td>
        <td>${formatBullwhip(item.bullwhip)}</td>
      </tr>`;
    }).join("");
    const alternateMode = summary.recommendationMode === "shared" ? "local" : "shared";
    const alternate = completedExperiments.get(`${summary.scenarioKey}|${alternateMode}`);
    const comparison = alternate
      ? `<div class="turning-point comparison"><b>同路径策略对照</b><br>相对${recommendationModeLabel(alternate.recommendationMode)}：全链成本 ${signedChange(summary.totalCost - alternate.totalCost, "元")}，零售发运率 ${signedChange(dispatchService - alternate.dispatchRate * 100, "%")}；比较时请保持同一模式并尽量采用全部建议。</div>`
      : `<div class="turning-point comparison"><b>下一次实验</b><br>改用“${recommendationModeLabel(alternateMode)}”重跑同一情景；完成后这里会自动对照成本与发运率。</div>`;
    ui.turningPoints.innerHTML = [
      `<div class="turning-point"><b>最大订货周 · W${largest.week}</b><br>你订了 ${qty(largest.orders[index])}，当周终端需求为 ${qty(largest.demand)}。${summary.highestBullwhip ? `全链最高放大：${ROLES[summary.highestBullwhip.index].name} ${formatBullwhip(summary.highestBullwhip.bullwhip)}。` : "终端需求没有足够波动，暂不计算牛鞭倍数。"}${bottleneck.backlog > 0 ? `主要背单：${ROLES[bottleneck.index].name} ${qty(bottleneck.backlog)}。` : "期末没有待发背单。"}在途补给 ${qty(remainingSupply)}、客户配送 ${qty(customerInTransit)}；客户签收率 ${deliveryService.toFixed(0)}%。</div>`,
      comparison
    ].join("");
    completedExperiments.set(`${summary.scenarioKey}|${summary.recommendationMode}`, summary);
    ui.switchStrategy.textContent = `改用${recommendationModeLabel(alternateMode)}重跑`;
    if (typeof ui.dialog.showModal === "function" && !ui.dialog.open) ui.dialog.showModal();
  }

  function resetGame() {
    sequence += 1;
    if (ui.dialog.open) ui.dialog.close();
    if (ui.guideDialog.open) ui.guideDialog.close();
    coachOpen = false;
    revealNetwork = false;
    game = makeGame();
    beginWeek();
    maybeStartGuide();
  }

  function bindEvents() {
    ui.restart.addEventListener("click", resetGame);
    ui.settingsButton.addEventListener("click", openSettings);
    ui.closeSettings.addEventListener("click", closeSettings);
    ui.cancelSettings.addEventListener("click", closeSettings);
    ui.saveSettings.addEventListener("click", saveSettings);
    [ui.orderLeadInput, ui.shipmentLeadInput, ui.customerDeliveryLeadInput, ui.productionLeadInput, ui.demandJitterInput, ui.demandSeedInput, ui.recommendationModeInput, ui.expediteReductionInput, ui.expediteCostInput].forEach((input) => {
      input.addEventListener("input", updateSettingsPreview);
      input.addEventListener("change", updateSettingsPreview);
    });
    ui.expediteEnabledInput.addEventListener("change", updateSettingsPreview);
    ui.settingsDialog.addEventListener("cancel", (event) => {
      event.preventDefault();
      closeSettings();
    });
    ui.mode.addEventListener("change", resetGame);
    ui.role.addEventListener("change", resetGame);
    ui.visibility.addEventListener("click", () => {
      revealNetwork = !revealNetwork;
      render();
    });
    ui.explain.addEventListener("click", () => {
      coachOpen = !coachOpen;
      renderCoach();
    });
    ui.apply.addEventListener("click", () => {
      if (!game || game.phase !== "decision") return;
      if (game.mode === "sandbox") {
        game.recommendations.forEach((recommendation) => {
          game.drafts[recommendation.stageIndex] = recommendation.suggested;
        });
      } else {
        game.drafts[game.playerIndex] = game.recommendations[game.playerIndex].suggested;
      }
      renderStages();
      renderCoach();
      renderAction();
      renderGuide();
    });
    ui.submit.addEventListener("click", closeWeek);
    ui.fast.addEventListener("change", () => { if (game) game.fast = ui.fast.checked; });
    ui.closeResult.addEventListener("click", () => ui.dialog.close());
    ui.playAgain.addEventListener("click", resetGame);
    ui.switchStrategy.addEventListener("click", () => {
      CONFIG.recommendationMode = CONFIG.recommendationMode === "shared" ? "local" : "shared";
      resetGame();
    });
    ui.guideButton.addEventListener("click", () => startGuide(true));
    ui.guidePrevious.addEventListener("click", () => {
      guideIndex = Math.max(0, guideIndex - 1);
      renderGuide();
    });
    ui.guideNext.addEventListener("click", () => {
      if (guideIndex >= GUIDE_STEPS.length - 1) {
        closeGuide(true);
        return;
      }
      guideIndex += 1;
      renderGuide();
    });
    ui.guideSkip.addEventListener("click", () => closeGuide(false));
    ui.guideClose.addEventListener("click", () => closeGuide(false));
    ui.guideDialog.addEventListener("cancel", (event) => {
      event.preventDefault();
      closeGuide(false);
    });
    window.addEventListener("resize", () => {
      if (game) drawChart();
      if (ui.guideDialog.open) renderGuide();
    });
  }

  bindEvents();
  resetGame();
}());
