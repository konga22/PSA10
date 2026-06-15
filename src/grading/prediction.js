import {
  ALTERATION_PROFILES,
  COMPANY_ORDER,
  COMPANY_STANDARDS,
  CONDITION_PROFILES,
  SUBGRADE_BY_CONDITION,
} from "./standards.js";

const CONFIDENCE_LABELS = ["높음", "중간", "낮음"];
const CONDITION_FIELDS = ["corners", "edges", "surface"];

export function predictAll({ frontMeasurement, backMeasurement, manualChecks }) {
  const predictions = {};

  for (const companyId of COMPANY_ORDER) {
    predictions[companyId] = predictCompany({
      company: COMPANY_STANDARDS[companyId],
      frontMeasurement,
      backMeasurement,
      manualChecks,
    });
  }

  return predictions;
}

export function getOverallConfidence(predictions) {
  const confidenceScore = Math.min(
    ...Object.values(predictions).map((prediction) => prediction.confidenceScore),
  );

  return CONFIDENCE_LABELS[2 - confidenceScore] ?? "낮음";
}

function predictCompany({ company, frontMeasurement, backMeasurement, manualChecks }) {
  const reasons = [];
  const alteration = ALTERATION_PROFILES[manualChecks.alteration];

  if (alteration?.noGrade) {
    return {
      companyId: company.id,
      label: company.label,
      displayGrade: "보류",
      rangeLabel: "보류",
      confidenceScore: 0,
      confidenceLabel: "낮음",
      reasons: ["변조/복원/트리밍 의심 체크됨", "공식 numeric grade 예측 중단"],
      subgrades: buildBgsSubgrades(company.id, null, manualChecks),
    };
  }

  const centerTier = findCenterTier(company, frontMeasurement, backMeasurement, reasons);
  const conditionCap = getConditionCap(company, manualChecks, reasons);
  const upperGrade = Math.min(centerTier.grade, conditionCap);
  const missingPenalty = getMissingPenalty(frontMeasurement, backMeasurement, manualChecks);
  const lowerGrade = Math.max(1, roundGrade(upperGrade - missingPenalty));
  const confidenceScore = getConfidenceScore(frontMeasurement, backMeasurement, manualChecks);
  const rangeLabel = buildRangeLabel(company, lowerGrade, upperGrade, centerTier, manualChecks);
  const labelRecommendation = buildBgsLabelRecommendation({
    companyId: company.id,
    lowerGrade,
    upperGrade,
    centerTier,
    manualChecks,
  });

  return {
    companyId: company.id,
    label: company.label,
    displayGrade: rangeLabel,
    rangeLabel,
    confidenceScore,
    confidenceLabel: CONFIDENCE_LABELS[2 - confidenceScore] ?? "낮음",
    reasons: compactReasons([
      ...reasons,
      buildCenterTierReason(company, centerTier),
      labelRecommendation?.reason,
      confidenceScore < 2 ? "미확인 항목 때문에 후보 범위 확장" : null,
    ]),
    subgrades: buildBgsSubgrades(company.id, centerTier, manualChecks),
    labelRecommendation,
  };
}

function findCenterTier(company, frontMeasurement, backMeasurement, reasons) {
  if (!frontMeasurement?.isValid) {
    reasons.push("앞면 센터링 미측정");
    return { grade: 8, label: "front unchecked" };
  }

  const frontWorst = frontMeasurement.worstSide;
  const backWorst = backMeasurement?.isValid ? backMeasurement.worstSide : null;

  if (backWorst == null) {
    reasons.push(`뒷면 센터링 미측정: ${company.label} 상위권은 뒷면 기준도 비교 필요`);
  }

  const tier = company.centerTiers.find((candidate) => {
    const frontPass = frontWorst <= candidate.frontMax;
    const backPass = backWorst == null || backWorst <= candidate.backMax;
    return frontPass && backPass;
  });

  if (tier) {
    reasons.push(`앞면 센터링 ${frontWorst.toFixed(1)}%: ${company.label} ${tier.label} 기준 ${formatRatioLimit(tier.frontMax)} 이내`);
    if (backWorst != null) {
      reasons.push(`뒷면 센터링 ${backWorst.toFixed(1)}%: ${company.label} ${tier.label} 기준 ${formatRatioLimit(tier.backMax)} 이내`);
    }
    return tier;
  }

  reasons.push(`앞면 센터링 ${frontWorst.toFixed(1)}%: ${company.label} 상위 기준보다 밀림`);
  if (backWorst != null) {
    reasons.push(`뒷면 센터링 ${backWorst.toFixed(1)}%: ${company.label} 상위 기준보다 밀림`);
  }

  return { grade: 7, label: "low centering" };
}

function getConditionCap(company, manualChecks, reasons) {
  let cap = 10.1;
  let minorCount = 0;

  for (const field of CONDITION_FIELDS) {
    const value = manualChecks[field];
    const profile = CONDITION_PROFILES[value] ?? CONDITION_PROFILES.unchecked;

    if (value === "unchecked") {
      reasons.push(`${getFieldLabel(field)} 미확인`);
    } else if (value !== "clean") {
      reasons.push(buildConditionReason(company, field, value));
    }

    if (value === "minor") {
      minorCount += 1;
    }

    if (value === "visible" || value === "severe") {
      cap = Math.min(cap, profile.cap);
    }
  }

  if (minorCount >= 2) {
    cap = Math.min(cap, 9.5);
    reasons.push("미세 결함 2개 이상: 상위 등급 리스크를 등급 범위에 반영");
  } else if (minorCount === 1 && company.id === "bgs") {
    cap = Math.min(cap, 9.5);
    reasons.push("BGS는 서브그레이드 민감: 미세 결함 1개도 해당 서브 9.5 리스크");
  } else if (minorCount === 1 && company.id === "cgc") {
    cap = Math.min(cap, 10);
    reasons.push("CGC Pristine 10은 확대상 결함 없음에 가까워야 해서 미세 결함은 Pristine 리스크");
  } else if (minorCount === 1) {
    cap = Math.min(cap, 10);
    reasons.push(`${company.label} 미세 결함 1개: hard cap보다 10 리스크로 표시`);
  }

  return cap;
}

function getMissingPenalty(frontMeasurement, backMeasurement, manualChecks) {
  let penalty = 0;

  if (!frontMeasurement?.isValid) {
    penalty += 1;
  }

  if (!backMeasurement?.isValid) {
    penalty += 0.5;
  }

  for (const field of CONDITION_FIELDS) {
    if (manualChecks[field] === "unchecked") {
      penalty += 0.5;
    }
  }

  return Math.min(2, penalty);
}

function getConfidenceScore(frontMeasurement, backMeasurement, manualChecks) {
  let score = 2;

  if (!frontMeasurement?.isValid) {
    score -= 1;
  }

  if (!backMeasurement?.isValid) {
    score -= 1;
  }

  for (const field of CONDITION_FIELDS) {
    if (manualChecks[field] === "unchecked") {
      score -= 1;
      break;
    }
  }

  return Math.max(0, score);
}

function buildRangeLabel(company, lowerGrade, upperGrade, centerTier, manualChecks) {
  if (
    company.id === "bgs"
    && centerTier?.label === "10 BL"
    && lowerGrade >= 10
    && upperGrade >= 10
    && areConditionChecksClean(manualChecks)
  ) {
    return "10 BL";
  }

  if (company.id === "cgc" && upperGrade > 10) {
    return lowerGrade >= 10 ? "Pristine 10" : `${formatGrade(lowerGrade)}-Pristine`;
  }

  const upperLabel = formatGrade(Math.min(upperGrade, 10));
  const lowerLabel = formatGrade(Math.min(lowerGrade, 10));

  if (upperLabel === lowerLabel) {
    return `${upperLabel}`;
  }

  return `${lowerLabel}-${upperLabel}`;
}

function areConditionChecksClean(manualChecks) {
  return CONDITION_FIELDS.every((field) => manualChecks[field] === "clean");
}

function buildBgsLabelRecommendation({ companyId, lowerGrade, upperGrade, centerTier, manualChecks }) {
  if (companyId !== "bgs") {
    return null;
  }

  if (
    centerTier?.label === "10 BL"
    && lowerGrade >= 10
    && upperGrade >= 10
    && areConditionChecksClean(manualChecks)
  ) {
    return {
      tone: "black",
      title: "Black Label 후보",
      detail: "4개 서브그레이드가 모두 10이어야 하는 최상위 후보",
      reason: "BGS 라벨 추천: Black Label은 Centering/Corners/Edges/Surface 전부 10 후보일 때만 표시",
    };
  }

  if (upperGrade >= 10 && areConditionChecksClean(manualChecks)) {
    return {
      tone: "gold",
      title: "Gold Label 10 후보",
      detail: "BGS 10 후보지만 Black Label 확정 조건은 아님",
      reason: "BGS 라벨 추천: 10 후보지만 4개 서브 전체 10 확정이 아니므로 Gold Label 후보",
    };
  }

  if (upperGrade >= 9.5) {
    return {
      tone: "gold",
      title: "Gold Label 9.5 후보",
      detail: "BGS 9.5 Gem Mint 후보권",
      reason: "BGS 라벨 추천: 9.5 후보권은 Gold Label 후보로 표시",
    };
  }

  return null;
}

function buildBgsSubgrades(companyId, centerTier, manualChecks) {
  if (companyId !== "bgs") {
    return null;
  }

  return {
    Centering: centerTier ? Math.min(centerTier.grade, 10) : null,
    Corners: SUBGRADE_BY_CONDITION[manualChecks.corners],
    Edges: SUBGRADE_BY_CONDITION[manualChecks.edges],
    Surface: SUBGRADE_BY_CONDITION[manualChecks.surface],
  };
}

function compactReasons(reasons) {
  return [...new Set(reasons.filter(Boolean))].slice(0, 12);
}

function roundGrade(value) {
  return Math.round(value * 2) / 2;
}

function formatGrade(value) {
  if (Number.isInteger(value)) {
    return String(value);
  }

  return value.toFixed(1);
}

function getFieldLabel(field) {
  const labels = {
    corners: "코너",
    edges: "엣지",
    surface: "표면",
  };

  return labels[field] ?? field;
}

function buildCenterTierReason(company, centerTier) {
  if (centerTier.label === "front unchecked") {
    return `${company.label} 센터링 기준 비교 불가: 앞면 기준선 필요`;
  }

  if (centerTier.label === "low centering") {
    return `${company.label} 센터링 기준: 상위 후보권 밖`;
  }

  return `${company.label} 센터링 기준 비교: ${centerTier.label} 후보권`;
}

function buildConditionReason(company, field, value) {
  const profile = CONDITION_PROFILES[value] ?? CONDITION_PROFILES.unchecked;
  const fieldLabel = getFieldLabel(field);

  if (value === "minor") {
    return `${fieldLabel}: 미세 - ${company.label} 상위권은 결함 없음이 유리하지만 단독 미세는 리스크로 반영`;
  }

  if (value === "visible") {
    return `${fieldLabel}: 보임 - ${company.label} 10 후보 기준의 깨끗한 ${fieldLabel} 조건과 충돌`;
  }

  if (value === "severe") {
    return `${fieldLabel}: 심함 - ${profile.reason}, 제출 효율 낮음`;
  }

  return `${fieldLabel}: ${profile.reason}`;
}

function formatRatioLimit(maxSide) {
  return `${(100 - maxSide).toFixed(maxSide % 1 === 0 ? 0 : 1)}/${maxSide.toFixed(maxSide % 1 === 0 ? 0 : 1)}`;
}
