import { calculateCentering, formatRatio } from "../grading/measurement.js";
import { analyzeSidePhoto, createEmptyAnalysis } from "../grading/imageAnalysis.js";
import { predictAll, getOverallConfidence } from "../grading/prediction.js";
import {
  COMPANY_ORDER,
  CONDITION_RUBRIC,
  DEFAULT_MANUAL_CHECKS,
  MANUAL_INSPECTION_GUIDE,
} from "../grading/standards.js";
import { CanvasEditor, createDefaultPhotoTransform } from "./canvasEditor.js";

const state = {
  currentSide: "front",
  activeLayer: "outer",
  sides: {
    front: createSideState(),
    back: createSideState(),
  },
  measurements: {
    front: null,
    back: null,
  },
  manualChecks: { ...DEFAULT_MANUAL_CHECKS },
  photoAnalysis: {
    front: createEmptyAnalysis(),
    back: createEmptyAnalysis(),
  },
  precisionZoomEnabled: false,
  gridVisible: true,
  guidesVisible: true,
  predictions: {},
};

const analysisTimers = {};
let analysisSequence = 0;

const elements = {
  canvas: document.querySelector("#cardCanvas"),
  dropZone: document.querySelector("#dropZone"),
  emptyState: document.querySelector("#emptyState"),
  imageInput: document.querySelector("#imageInput"),
  themeToggleButton: document.querySelector("#themeToggleButton"),
  resetButton: document.querySelector("#resetButton"),
  frontTab: document.querySelector("#frontTab"),
  backTab: document.querySelector("#backTab"),
  outerModeButton: document.querySelector("#outerModeButton"),
  innerModeButton: document.querySelector("#innerModeButton"),
  precisionZoomButton: document.querySelector("#precisionZoomButton"),
  transformResetButton: document.querySelector("#transformResetButton"),
  gridToggleButton: document.querySelector("#gridToggleButton"),
  guideToggleButton: document.querySelector("#guideToggleButton"),
  rotationInput: document.querySelector("#rotationInput"),
  rotationOutput: document.querySelector("#rotationOutput"),
  verticalTiltInput: document.querySelector("#verticalTiltInput"),
  verticalTiltOutput: document.querySelector("#verticalTiltOutput"),
  horizontalTiltInput: document.querySelector("#horizontalTiltInput"),
  horizontalTiltOutput: document.querySelector("#horizontalTiltOutput"),
  lrValue: document.querySelector("#lrValue"),
  tbValue: document.querySelector("#tbValue"),
  confidenceValue: document.querySelector("#confidenceValue"),
  photoQuality: document.querySelector("#photoQuality"),
  photoCorners: document.querySelector("#photoCorners"),
  photoEdges: document.querySelector("#photoEdges"),
  photoSurface: document.querySelector("#photoSurface"),
  manualGuide: document.querySelector("#manualGuide"),
  conditionRubric: document.querySelector("#conditionRubric"),
  manualStatus: document.querySelector("#manualStatus"),
  predictionDetails: document.querySelector("#predictionDetails"),
  scorePsa: document.querySelector("#scorePsa"),
  scoreBgs: document.querySelector("#scoreBgs"),
  scoreCgc: document.querySelector("#scoreCgc"),
  scoreBrg: document.querySelector("#scoreBrg"),
};

const scoreElements = {
  psa: elements.scorePsa,
  bgs: elements.scoreBgs,
  cgc: elements.scoreCgc,
  brg: elements.scoreBrg,
};

const transformControls = {
  rotation: {
    input: elements.rotationInput,
    output: elements.rotationOutput,
  },
  tiltY: {
    input: elements.verticalTiltInput,
    output: elements.verticalTiltOutput,
  },
  tiltX: {
    input: elements.horizontalTiltInput,
    output: elements.horizontalTiltOutput,
  },
};

const editor = new CanvasEditor(elements.canvas, {
  onChange: () => {
    updatePredictions();
    schedulePhotoAnalysis(state.currentSide);
  },
});

initializeTheme();
bindEvents();
renderManualGuides();
renderManualChecks();
editor.setSideData(state.sides.front);
renderOverlayToggles();
renderPhotoTransformControls();
updatePredictions();
loadDemoIfRequested();

function bindEvents() {
  elements.imageInput.addEventListener("change", () => onImageSelected());
  elements.emptyState.addEventListener("click", () => elements.imageInput.click());
  elements.dropZone.addEventListener("dragenter", (event) => onDragEnter(event));
  elements.dropZone.addEventListener("dragover", (event) => onDragOver(event));
  elements.dropZone.addEventListener("dragleave", (event) => onDragLeave(event));
  elements.dropZone.addEventListener("drop", (event) => onDropImage(event));
  elements.themeToggleButton.addEventListener("click", () => toggleTheme());
  elements.resetButton.addEventListener("click", () => resetInspection());
  elements.frontTab.addEventListener("click", () => switchSide("front"));
  elements.backTab.addEventListener("click", () => switchSide("back"));
  elements.outerModeButton.addEventListener("click", () => switchLayer("outer"));
  elements.innerModeButton.addEventListener("click", () => switchLayer("inner"));
  elements.precisionZoomButton.addEventListener("click", () => togglePrecisionZoom());
  elements.transformResetButton.addEventListener("click", () => resetPhotoTransform());
  elements.gridToggleButton.addEventListener("click", () => toggleGridVisibility());
  elements.guideToggleButton.addEventListener("click", () => toggleGuideVisibility());
  Object.entries(transformControls).forEach(([field, control]) => {
    control.input.addEventListener("input", () => updatePhotoTransform(field, control.input.value));
  });
  document.querySelectorAll(".check-group").forEach((group) => {
    group.addEventListener("click", (event) => {
      const button = event.target.closest("button[data-value]");
      if (!button) {
        return;
      }

      updateManualCheck(group.dataset.field, button.dataset.value);
    });
  });
}

async function onImageSelected() {
  const file = elements.imageInput.files?.[0];
  if (!file) {
    return;
  }

  await loadImageFile(file);
  elements.imageInput.value = "";
}

async function loadImageFile(file) {
  if (!file.type.startsWith("image/")) {
    return;
  }

  const dataUrl = await readFileAsDataUrl(file);
  await editor.setImageDataUrl(dataUrl);
  renderPhotoTransformControls();
  updatePredictions();
  runPhotoAnalysis(state.currentSide);
}

function onDragEnter(event) {
  if (!hasImageDrag(event)) {
    return;
  }

  event.preventDefault();
  elements.dropZone.classList.add("is-dragging");
}

function onDragOver(event) {
  if (!hasImageDrag(event)) {
    return;
  }

  event.preventDefault();
  event.dataTransfer.dropEffect = "copy";
  elements.dropZone.classList.add("is-dragging");
}

function onDragLeave(event) {
  if (elements.dropZone.contains(event.relatedTarget)) {
    return;
  }

  elements.dropZone.classList.remove("is-dragging");
}

async function onDropImage(event) {
  if (!hasImageDrag(event)) {
    return;
  }

  event.preventDefault();
  elements.dropZone.classList.remove("is-dragging");

  const file = [...event.dataTransfer.files].find((item) => item.type.startsWith("image/"));
  if (!file) {
    return;
  }

  await loadImageFile(file);
}

function hasImageDrag(event) {
  return [...event.dataTransfer?.items ?? []].some((item) => (
    item.kind === "file" && item.type.startsWith("image/")
  ));
}

function initializeTheme() {
  const storedTheme = window.localStorage.getItem("grade-preview-theme");
  const systemDark = window.matchMedia?.("(prefers-color-scheme: dark)").matches;
  applyTheme(storedTheme ?? (systemDark ? "dark" : "light"));
}

function toggleTheme() {
  const nextTheme = document.documentElement.dataset.theme === "dark" ? "light" : "dark";
  applyTheme(nextTheme);
  window.localStorage.setItem("grade-preview-theme", nextTheme);
}

function applyTheme(theme) {
  const normalizedTheme = theme === "dark" ? "dark" : "light";
  document.documentElement.dataset.theme = normalizedTheme;
  document.querySelector('meta[name="theme-color"]')?.setAttribute(
    "content",
    normalizedTheme === "dark" ? "#0d1110" : "#f8faf7",
  );
  elements.themeToggleButton.textContent = normalizedTheme === "dark" ? "Light" : "Dark";
  elements.themeToggleButton.setAttribute("aria-pressed", String(normalizedTheme === "dark"));
}

function switchSide(side) {
  if (state.currentSide === side) {
    return;
  }

  state.currentSide = side;
  editor.setSideData(state.sides[side]);
  updateActiveButton(elements.frontTab, side === "front");
  updateActiveButton(elements.backTab, side === "back");
  renderPhotoTransformControls();
  updatePredictions();
}

function switchLayer(layer) {
  state.activeLayer = layer;
  editor.setActiveLayer(layer);
  updateActiveButton(elements.outerModeButton, layer === "outer");
  updateActiveButton(elements.innerModeButton, layer === "inner");
}

function togglePrecisionZoom() {
  state.precisionZoomEnabled = !state.precisionZoomEnabled;
  editor.setAutoMagnifierEnabled(state.precisionZoomEnabled);
  updateActiveButton(elements.precisionZoomButton, state.precisionZoomEnabled);
}

function toggleGridVisibility() {
  state.gridVisible = !state.gridVisible;
  editor.setGridVisible(state.gridVisible);
  renderOverlayToggles();
}

function toggleGuideVisibility() {
  state.guidesVisible = !state.guidesVisible;
  editor.setGuidesVisible(state.guidesVisible);
  renderOverlayToggles();
}

function updatePhotoTransform(field, value) {
  const transform = getCurrentPhotoTransform();
  transform[field] = Number(value);
  editor.setPhotoTransform(transform);
  renderPhotoTransformControls();
}

function resetPhotoTransform() {
  state.sides[state.currentSide].photoTransform = createDefaultPhotoTransform();
  editor.setPhotoTransform(state.sides[state.currentSide].photoTransform);
  renderPhotoTransformControls();
}

function updateManualCheck(field, value) {
  if (field === "alteration") {
    state.manualChecks[field] = value;
  } else {
    state.manualChecks[field] = state.manualChecks[field] === value ? "unchecked" : value;
  }

  renderManualChecks();
  updatePredictions();
}

function updatePredictions() {
  state.measurements.front = getMeasurement(state.sides.front);
  state.measurements.back = getMeasurement(state.sides.back);
  state.predictions = predictAll({
    frontMeasurement: state.measurements.front,
    backMeasurement: state.measurements.back,
    manualChecks: getEffectiveChecks(),
  });

  renderCurrentMeasurement();
  renderScores();
  renderDetails();
  renderEmptyState();
  renderPhotoAnalysis();
}

function renderCurrentMeasurement() {
  const measurement = state.measurements[state.currentSide];

  elements.lrValue.textContent = formatRatio(measurement?.lr);
  elements.tbValue.textContent = formatRatio(measurement?.tb);
  elements.confidenceValue.textContent = state.measurements.front
    ? getOverallConfidence(state.predictions)
    : "-";
}

function renderScores() {
  if (!state.measurements.front) {
    for (const companyId of COMPANY_ORDER) {
      scoreElements[companyId].textContent = "-";
    }
    return;
  }

  for (const companyId of COMPANY_ORDER) {
    scoreElements[companyId].textContent = state.predictions[companyId]?.displayGrade ?? "-";
  }
}

function renderDetails() {
  if (!state.measurements.front) {
    elements.predictionDetails.replaceChildren(createEmptyPredictionItem());
    return;
  }

  elements.predictionDetails.replaceChildren(
    ...COMPANY_ORDER.map((companyId) => createPredictionItem(state.predictions[companyId])),
  );
}

function renderManualChecks() {
  document.querySelectorAll(".check-group").forEach((group) => {
    const field = group.dataset.field;
    const value = state.manualChecks[field];

    group.querySelectorAll("button[data-value]").forEach((button) => {
      updateActiveButton(button, button.dataset.value === value);
    });
  });

  const uncheckedCount = ["corners", "edges", "surface"].filter(
    (field) => state.manualChecks[field] === "unchecked",
  ).length;

  elements.manualStatus.textContent = uncheckedCount === 0
    ? "수동 체크 완료"
    : `${uncheckedCount}개 항목 미확인`;
}

function renderManualGuides() {
  elements.manualGuide.replaceChildren(
    ...Object.values(MANUAL_INSPECTION_GUIDE).map((guide) => {
      const item = document.createElement("article");
      item.className = "guide-item";

      const title = document.createElement("strong");
      title.textContent = guide.label;

      const summary = document.createElement("p");
      summary.textContent = guide.summary;

      const list = document.createElement("ul");
      guide.checks.forEach((check) => {
        const listItem = document.createElement("li");
        listItem.textContent = check;
        list.append(listItem);
      });

      item.append(title, summary, list);
      return item;
    }),
  );

  elements.conditionRubric.replaceChildren(
    ...CONDITION_RUBRIC.map((rubric) => {
      const item = document.createElement("article");
      item.className = "rubric-item";

      const title = document.createElement("strong");
      title.textContent = rubric.label;

      const description = document.createElement("p");
      description.textContent = rubric.description;

      item.append(title, description);
      return item;
    }),
  );
}

function renderEmptyState() {
  const hasImage = Boolean(state.sides[state.currentSide].imageDataUrl);
  elements.emptyState.classList.toggle("is-hidden", hasImage);
}

function renderPhotoAnalysis() {
  const analysis = state.photoAnalysis[state.currentSide] ?? createEmptyAnalysis();

  elements.photoQuality.textContent = analysis.quality.label;
  elements.photoCorners.textContent = analysis.summaries.corners;
  elements.photoEdges.textContent = analysis.summaries.edges;
  elements.photoSurface.textContent = analysis.summaries.surface;
}

function renderPhotoTransformControls() {
  const transform = getCurrentPhotoTransform();

  transformControls.rotation.input.value = String(transform.rotation);
  transformControls.rotation.output.textContent = formatDegrees(transform.rotation);
  transformControls.tiltY.input.value = String(transform.tiltY);
  transformControls.tiltY.output.textContent = formatDegrees(transform.tiltY);
  transformControls.tiltX.input.value = String(transform.tiltX);
  transformControls.tiltX.output.textContent = formatDegrees(transform.tiltX);
}

function renderOverlayToggles() {
  updateActiveButton(elements.gridToggleButton, state.gridVisible);
  updateActiveButton(elements.guideToggleButton, state.guidesVisible);
}

function resetInspection() {
  state.currentSide = "front";
  state.activeLayer = "outer";
  state.sides.front = createSideState();
  state.sides.back = createSideState();
  state.measurements.front = null;
  state.measurements.back = null;
  state.manualChecks = { ...DEFAULT_MANUAL_CHECKS };
  state.photoAnalysis.front = createEmptyAnalysis();
  state.photoAnalysis.back = createEmptyAnalysis();

  state.precisionZoomEnabled = false;
  state.gridVisible = true;
  state.guidesVisible = true;
  editor.setAutoMagnifierEnabled(false);
  editor.setGridVisible(true);
  editor.setGuidesVisible(true);
  updateActiveButton(elements.precisionZoomButton, false);
  renderOverlayToggles();
  switchLayer("outer");
  updateActiveButton(elements.frontTab, true);
  updateActiveButton(elements.backTab, false);
  editor.setSideData(state.sides.front);
  renderPhotoTransformControls();
  renderManualChecks();
  updatePredictions();
}

function createPredictionItem(prediction) {
  const item = document.createElement("article");
  item.className = "prediction-item";

  const head = document.createElement("div");
  head.className = "prediction-head";

  const title = document.createElement("strong");
  title.textContent = prediction.label;

  const grade = document.createElement("span");
  grade.textContent = `${prediction.rangeLabel} · ${prediction.confidenceLabel}`;

  head.append(title, grade);
  item.append(head);

  if (prediction.subgrades) {
    const subgrade = document.createElement("p");
    subgrade.className = "subgrade-line";
    subgrade.textContent = Object.entries(prediction.subgrades)
      .map(([key, value]) => `${key} ${value ?? "-"}`)
      .join(" / ");
    item.append(subgrade);
  }

  const reasons = document.createElement("ul");
  reasons.className = "reason-list";

  prediction.reasons.forEach((reason) => {
    const listItem = document.createElement("li");
    listItem.textContent = reason;
    reasons.append(listItem);
  });

  item.append(reasons);
  return item;
}

function createEmptyPredictionItem() {
  const item = document.createElement("article");
  item.className = "prediction-item";

  const head = document.createElement("div");
  head.className = "prediction-head";

  const title = document.createElement("strong");
  title.textContent = "검사 대기";

  const grade = document.createElement("span");
  grade.textContent = "사진 필요";

  head.append(title, grade);
  item.append(head);

  return item;
}

function getMeasurement(side) {
  if (!side.imageDataUrl || !side.outerQuad || !side.innerQuad) {
    return null;
  }

  try {
    return calculateCentering(side.outerQuad, side.innerQuad);
  } catch {
    return null;
  }
}

function getEffectiveChecks() {
  const effectiveChecks = { ...state.manualChecks };
  const frontAnalysis = state.photoAnalysis.front;
  const backAnalysis = state.photoAnalysis.back;

  for (const field of ["corners", "edges", "surface"]) {
    if (effectiveChecks[field] !== "unchecked") {
      continue;
    }

    const strongestSuggestion = getStrongestSuggestion([
      frontAnalysis?.checks[field],
      backAnalysis?.checks[field],
    ]);

    if (strongestSuggestion !== "clean" && strongestSuggestion !== "unchecked") {
      effectiveChecks[field] = strongestSuggestion;
    }
  }

  return effectiveChecks;
}

function getStrongestSuggestion(values) {
  const rank = {
    unchecked: 0,
    clean: 1,
    minor: 2,
    visible: 3,
    severe: 4,
  };

  return values.reduce((strongest, value) => (
    (rank[value] ?? 0) > (rank[strongest] ?? 0) ? value : strongest
  ), "unchecked");
}

function schedulePhotoAnalysis(side) {
  window.clearTimeout(analysisTimers[side]);
  analysisTimers[side] = window.setTimeout(() => runPhotoAnalysis(side), 300);
}

async function runPhotoAnalysis(side) {
  const sideData = state.sides[side];
  if (!sideData.imageDataUrl) {
    state.photoAnalysis[side] = createEmptyAnalysis();
    updatePredictions();
    return;
  }

  const sequence = (analysisSequence += 1);
  const result = await analyzeSidePhoto(sideData);
  if (sequence !== analysisSequence && side === state.currentSide) {
    return;
  }

  state.photoAnalysis[side] = result;
  updatePredictions();
}

function updateActiveButton(button, isActive) {
  button.classList.toggle("is-active", isActive);
  if (button.hasAttribute("aria-pressed")) {
    button.setAttribute("aria-pressed", String(isActive));
  }

  if (button.matches(".choice-row button")) {
    button.classList.toggle("is-selected", isActive);
  }
}

function createSideState() {
  return {
    imageDataUrl: null,
    outerQuad: null,
    innerQuad: null,
    photoTransform: createDefaultPhotoTransform(),
  };
}

function getCurrentPhotoTransform() {
  if (!state.sides[state.currentSide].photoTransform) {
    state.sides[state.currentSide].photoTransform = createDefaultPhotoTransform();
  }

  return { ...state.sides[state.currentSide].photoTransform };
}

function formatDegrees(value) {
  return `${Number(value).toFixed(1)}°`;
}

function readFileAsDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(file);
  });
}

async function loadDemoIfRequested() {
  const params = new URLSearchParams(window.location.search);
  if (params.get("demo") !== "1") {
    return;
  }

  await editor.setImageDataUrl(createDemoImageDataUrl());
  renderPhotoTransformControls();
  state.manualChecks = {
    corners: "clean",
    edges: "clean",
    surface: "clean",
    alteration: "none",
  };
  renderManualChecks();
  updatePredictions();
  runPhotoAnalysis("front");
}

function createDemoImageDataUrl() {
  const svg = [
    '<svg xmlns="http://www.w3.org/2000/svg" width="1000" height="1400" viewBox="0 0 1000 1400">',
    '<rect width="1000" height="1400" rx="36" fill="#f8f3e8"/>',
    '<rect x="46" y="46" width="908" height="1308" rx="28" fill="#d83b2f"/>',
    '<rect x="118" y="158" width="764" height="1084" rx="10" fill="#162132"/>',
    '<rect x="150" y="195" width="700" height="460" rx="8" fill="#1d73d8"/>',
    '<circle cx="315" cy="440" r="155" fill="#111a28"/>',
    '<circle cx="650" cy="510" r="95" fill="#f58a3d"/>',
    '<rect x="150" y="715" width="700" height="320" rx="10" fill="#f6f0dd"/>',
    '<rect x="150" y="1088" width="700" height="92" rx="10" fill="#f0cb58"/>',
    '<text x="150" y="120" font-family="Arial, sans-serif" font-size="54" font-weight="700" fill="#fff">Demo Card</text>',
    '<text x="184" y="812" font-family="Arial, sans-serif" font-size="36" font-weight="700" fill="#1b1b1b">Centering Preview</text>',
    '</svg>',
  ].join("");

  return `data:image/svg+xml;base64,${btoa(svg)}`;
}
