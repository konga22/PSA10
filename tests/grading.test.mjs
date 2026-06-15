import test from "node:test";
import assert from "node:assert/strict";
import { calculateCentering } from "../src/grading/measurement.js";
import { predictAll } from "../src/grading/prediction.js";
import { DEFAULT_MANUAL_CHECKS } from "../src/grading/standards.js";
import {
  createDefaultPhotoTransform,
  createDefaultViewZoom,
  normalizePhotoTransform,
  normalizeViewZoom,
} from "../src/ui/canvasEditor.js";
import { getQuadSideValue, getSideHandlePositions, moveQuadSide } from "../src/ui/quadControls.js";

const outer = [
  { x: 0, y: 0 },
  { x: 1000, y: 0 },
  { x: 1000, y: 1400 },
  { x: 0, y: 1400 },
];

test("calculates balanced centering from outer and inner quads", () => {
  const inner = [
    { x: 120, y: 160 },
    { x: 880, y: 160 },
    { x: 880, y: 1240 },
    { x: 120, y: 1240 },
  ];

  const measurement = calculateCentering(outer, inner);

  assert.equal(measurement.isValid, true);
  assert.equal(measurement.lr.first.toFixed(1), "50.0");
  assert.equal(measurement.lr.second.toFixed(1), "50.0");
  assert.equal(measurement.tb.first.toFixed(1), "50.0");
  assert.equal(measurement.tb.second.toFixed(1), "50.0");
});

test("calculates off-center left/right ratio", () => {
  const inner = [
    { x: 90, y: 160 },
    { x: 860, y: 160 },
    { x: 860, y: 1240 },
    { x: 90, y: 1240 },
  ];

  const measurement = calculateCentering(outer, inner);

  assert.equal(measurement.lr.first.toFixed(1), "39.1");
  assert.equal(measurement.lr.second.toFixed(1), "60.9");
});

test("predicts high candidates when centering and manual checks are clean", () => {
  const inner = [
    { x: 120, y: 160 },
    { x: 880, y: 160 },
    { x: 880, y: 1240 },
    { x: 120, y: 1240 },
  ];
  const measurement = calculateCentering(outer, inner);
  const predictions = predictAll({
    frontMeasurement: measurement,
    backMeasurement: measurement,
    manualChecks: {
      corners: "clean",
      edges: "clean",
      surface: "clean",
      alteration: "none",
    },
  });

  assert.equal(predictions.psa.displayGrade, "10");
  assert.equal(predictions.bgs.displayGrade, "10 BL");
  assert.equal(predictions.bgs.labelRecommendation.title, "Black Label 후보");
  assert.equal(predictions.bgs.labelRecommendation.tone, "black");
  assert.equal(predictions.bgs.subgrades.Corners, 10);
  assert.equal(predictions.cgc.displayGrade, "Pristine 10");
  assert.equal(predictions.brg.displayGrade, "10");
});

test("recommends BGS gold label when pristine centering misses black label threshold", () => {
  const inner = [
    { x: 117, y: 160 },
    { x: 877, y: 160 },
    { x: 877, y: 1240 },
    { x: 117, y: 1240 },
  ];
  const measurement = calculateCentering(outer, inner);
  const predictions = predictAll({
    frontMeasurement: measurement,
    backMeasurement: measurement,
    manualChecks: {
      corners: "clean",
      edges: "clean",
      surface: "clean",
      alteration: "none",
    },
  });

  assert.equal(predictions.bgs.displayGrade, "10");
  assert.equal(predictions.bgs.labelRecommendation.title, "Gold Label 10 후보");
  assert.equal(predictions.bgs.labelRecommendation.tone, "gold");
});

test("widens candidate range when back and manual checks are missing", () => {
  const inner = [
    { x: 120, y: 160 },
    { x: 880, y: 160 },
    { x: 880, y: 1240 },
    { x: 120, y: 1240 },
  ];
  const measurement = calculateCentering(outer, inner);
  const predictions = predictAll({
    frontMeasurement: measurement,
    backMeasurement: null,
    manualChecks: { ...DEFAULT_MANUAL_CHECKS },
  });

  assert.equal(predictions.psa.displayGrade, "8-10");
  assert.equal(predictions.psa.confidenceLabel, "낮음");
  assert.ok(predictions.psa.reasons.some((reason) => reason.includes("뒷면 센터링 미측정")));
});

test("caps grades when a visible surface issue is checked", () => {
  const inner = [
    { x: 120, y: 160 },
    { x: 880, y: 160 },
    { x: 880, y: 1240 },
    { x: 120, y: 1240 },
  ];
  const measurement = calculateCentering(outer, inner);
  const predictions = predictAll({
    frontMeasurement: measurement,
    backMeasurement: measurement,
    manualChecks: {
      corners: "clean",
      edges: "clean",
      surface: "visible",
      alteration: "none",
    },
  });

  assert.equal(predictions.psa.displayGrade, "8.5");
  assert.equal(predictions.bgs.subgrades.Surface, 8.5);
});

test("keeps a single minor issue as a top-grade risk instead of a universal hard drop", () => {
  const inner = [
    { x: 120, y: 160 },
    { x: 880, y: 160 },
    { x: 880, y: 1240 },
    { x: 120, y: 1240 },
  ];
  const measurement = calculateCentering(outer, inner);
  const predictions = predictAll({
    frontMeasurement: measurement,
    backMeasurement: measurement,
    manualChecks: {
      corners: "minor",
      edges: "clean",
      surface: "clean",
      alteration: "none",
    },
  });

  assert.equal(predictions.psa.displayGrade, "10");
  assert.equal(predictions.brg.displayGrade, "10");
  assert.equal(predictions.bgs.displayGrade, "9.5");
  assert.equal(predictions.bgs.subgrades.Corners, 9.5);
  assert.equal(predictions.bgs.labelRecommendation.title, "Gold Label 9.5 후보");
  assert.equal(predictions.bgs.labelRecommendation.tone, "gold");
});

test("caps top candidates when multiple minor issues are selected", () => {
  const inner = [
    { x: 120, y: 160 },
    { x: 880, y: 160 },
    { x: 880, y: 1240 },
    { x: 120, y: 1240 },
  ];
  const measurement = calculateCentering(outer, inner);
  const predictions = predictAll({
    frontMeasurement: measurement,
    backMeasurement: measurement,
    manualChecks: {
      corners: "minor",
      edges: "minor",
      surface: "clean",
      alteration: "none",
    },
  });

  assert.equal(predictions.psa.displayGrade, "9.5");
  assert.ok(predictions.psa.reasons.some((reason) => reason.includes("미세 결함 2개 이상")));
});

test("stops numeric prediction when alteration risk is selected", () => {
  const predictions = predictAll({
    frontMeasurement: null,
    backMeasurement: null,
    manualChecks: {
      corners: "clean",
      edges: "clean",
      surface: "clean",
      alteration: "suspect",
    },
  });

  assert.equal(predictions.psa.displayGrade, "보류");
  assert.equal(predictions.cgc.confidenceLabel, "낮음");
});

test("moves only the selected vertical side on horizontal adjustment", () => {
  const quad = [
    { x: 100, y: 100 },
    { x: 900, y: 100 },
    { x: 900, y: 1300 },
    { x: 100, y: 1300 },
  ];

  moveQuadSide(quad, "right", { x: 860, y: 520 }, { width: 1000, height: 1400 });

  assert.deepEqual(quad, [
    { x: 100, y: 100 },
    { x: 860, y: 100 },
    { x: 860, y: 1300 },
    { x: 100, y: 1300 },
  ]);
});

test("moves only the selected horizontal side on vertical adjustment", () => {
  const quad = [
    { x: 100, y: 100 },
    { x: 900, y: 100 },
    { x: 900, y: 1300 },
    { x: 100, y: 1300 },
  ];

  moveQuadSide(quad, "top", { x: 540, y: 150 }, { width: 1000, height: 1400 });

  assert.deepEqual(quad, [
    { x: 100, y: 150 },
    { x: 900, y: 150 },
    { x: 900, y: 1300 },
    { x: 100, y: 1300 },
  ]);
});

test("creates one touch handle for each side", () => {
  const handles = getSideHandlePositions(outer);

  assert.equal(handles.length, 4);
  assert.equal(handles.filter((handle) => handle.side === "top").length, 1);
  assert.equal(handles.filter((handle) => handle.side === "right").length, 1);
  assert.equal(handles.filter((handle) => handle.side === "bottom").length, 1);
  assert.equal(handles.filter((handle) => handle.side === "left").length, 1);
});

test("keeps side movement inside explicit constraints", () => {
  const quad = [
    { x: 100, y: 100 },
    { x: 900, y: 100 },
    { x: 900, y: 1300 },
    { x: 100, y: 1300 },
  ];

  moveQuadSide(quad, "right", { x: 600, y: 520 }, { width: 1000, height: 1400 }, { min: 820 });

  assert.equal(getQuadSideValue(quad, "right"), 820);
});

test("normalizes photo correction values inside safe slider limits", () => {
  assert.deepEqual(createDefaultPhotoTransform(), {
    rotation: 0,
    tiltX: 0,
    tiltY: 0,
  });

  assert.deepEqual(normalizePhotoTransform({
    rotation: 40,
    tiltX: -80,
    tiltY: 45,
  }), {
    rotation: 15,
    tiltX: -30,
    tiltY: 30,
  });
});

test("normalizes whole-photo zoom inside view limits", () => {
  assert.equal(createDefaultViewZoom(), 1);
  assert.equal(normalizeViewZoom(0.2), 1);
  assert.equal(normalizeViewZoom(3.7), 2.5);
  assert.equal(normalizeViewZoom(1.75), 1.75);
});
