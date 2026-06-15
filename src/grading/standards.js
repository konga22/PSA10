export const COMPANY_STANDARDS = {
  psa: {
    id: "psa",
    label: "PSA",
    source: "https://www.psacard.com/gradingstandards",
    centerTiers: [
      { grade: 10, label: "10", frontMax: 55, backMax: 75 },
      { grade: 9, label: "9", frontMax: 60, backMax: 90 },
      { grade: 8, label: "8", frontMax: 65, backMax: 90 },
      { grade: 7, label: "7", frontMax: 70, backMax: 92 },
      { grade: 6, label: "6", frontMax: 75, backMax: 95 },
    ],
  },
  bgs: {
    id: "bgs",
    label: "BGS",
    source: "https://www.beckett.com/grading",
    centerTiers: [
      { grade: 10, label: "10 BL", frontMax: 50.8, backMax: 55 },
      { grade: 10, label: "10", frontMax: 52, backMax: 60 },
      { grade: 9.5, label: "9.5", frontMax: 55, backMax: 60 },
      { grade: 9, label: "9", frontMax: 60, backMax: 70 },
      { grade: 8.5, label: "8.5", frontMax: 65, backMax: 75 },
      { grade: 8, label: "8", frontMax: 70, backMax: 80 },
    ],
  },
  cgc: {
    id: "cgc",
    label: "CGC",
    source: "https://www.cgccards.com/card-grading/grading-scale/",
    centerTiers: [
      { grade: 10.1, label: "Pristine 10", frontMax: 50.5, backMax: 55 },
      { grade: 10, label: "Gem 10", frontMax: 55, backMax: 75 },
      { grade: 9.5, label: "9.5", frontMax: 58, backMax: 85 },
      { grade: 9, label: "9", frontMax: 60, backMax: 90 },
      { grade: 8.5, label: "8.5", frontMax: 65, backMax: 90 },
      { grade: 8, label: "8", frontMax: 70, backMax: 92 },
    ],
  },
  brg: {
    id: "brg",
    label: "BRG",
    source: "https://break.co.kr/service/grading",
    centerTiers: [
      { grade: 10, label: "10", frontMax: 60, backMax: 70 },
      { grade: 9.5, label: "9.5", frontMax: 62, backMax: 75 },
      { grade: 9, label: "9", frontMax: 65, backMax: 80 },
      { grade: 8.5, label: "8.5", frontMax: 70, backMax: 85 },
      { grade: 8, label: "8", frontMax: 75, backMax: 90 },
    ],
  },
};

export const CONDITION_PROFILES = {
  unchecked: {
    label: "미확인",
    cap: 10,
    confidencePenalty: 1,
    reason: "수동 확인이 남아 있음",
    detail: "사진만으로 확정하지 못한 항목입니다. 후보 등급 범위를 넓게 봅니다.",
  },
  clean: {
    label: "깨끗함",
    cap: 10.1,
    confidencePenalty: 0,
    reason: "수동 확인 통과",
    detail: "육안과 확대 확인에서 흰점, 까짐, 눌림, 스크래치가 보이지 않는 상태입니다.",
  },
  minor: {
    label: "미세",
    cap: 10,
    confidencePenalty: 0,
    reason: "미세 결함",
    detail: "확대하거나 빛 각도를 바꿨을 때만 보이는 작은 점, 아주 얕은 라인, 극소 화이트닝입니다. 단독으로는 PSA/BRG 10 가능성을 바로 끊지 않고 리스크로 반영합니다.",
  },
  visible: {
    label: "보임",
    cap: 8.5,
    confidencePenalty: 0,
    reason: "눈에 보이는 결함",
    detail: "정면 사진이나 일반 육안에서도 확인되는 까짐, 칩, 흰점, 스크래치, 프린트 라인입니다.",
  },
  severe: {
    label: "심함",
    cap: 7,
    confidencePenalty: 0,
    reason: "큰 결함",
    detail: "둥글어진 코너, 깊은 찍힘, 넓은 까짐, 찢김, 강한 스크래치, 얼룩처럼 제출 전부터 등급 하락이 큰 상태입니다.",
  },
};

export const SUBGRADE_BY_CONDITION = {
  unchecked: null,
  clean: 10,
  minor: 9.5,
  visible: 8.5,
  severe: 7,
};

export const DEFAULT_MANUAL_CHECKS = {
  corners: "unchecked",
  edges: "unchecked",
  surface: "unchecked",
  alteration: "none",
};

export const ALTERATION_PROFILES = {
  none: {
    label: "없음",
    noGrade: false,
  },
  suspect: {
    label: "의심",
    noGrade: true,
  },
};

export const COMPANY_ORDER = ["psa", "bgs", "cgc", "brg"];

export const MANUAL_INSPECTION_GUIDE = {
  corners: {
    label: "코너",
    summary: "네 모서리의 날카로움과 흰점/찍힘/들뜸을 봅니다.",
    checks: [
      "좌상, 우상, 좌하, 우하 네 코너를 각각 확대해서 봅니다.",
      "하얀 점, 눌림, 접힘, 둥글어짐, 층 벌어짐이 있으면 표시합니다.",
      "검은 배경 위에서 보면 코너 화이트닝이 더 잘 보입니다.",
    ],
  },
  edges: {
    label: "엣지",
    summary: "상하좌우 네 변의 까짐, 칩, 절단면 거칠기를 봅니다.",
    checks: [
      "카드 네 변을 따라 흰 점, 칩, 들뜸, 보풀 같은 절단면을 확인합니다.",
      "특히 뒷면 진한 테두리는 작은 화이트닝도 잘 보입니다.",
      "한 지점만 미세하면 리스크, 여러 지점이 이어지면 보임 이상으로 봅니다.",
    ],
  },
  surface: {
    label: "표면",
    summary: "스크래치, 프린트 라인, 찍힘, 얼룩, 광택 손상을 봅니다.",
    checks: [
      "빛을 비스듬히 비춰서 홀로 스크래치와 프린트 라인을 확인합니다.",
      "카드 디자인 선과 실제 긁힘을 구분하기 위해 각도를 바꿔 봅니다.",
      "점 오염, 잉크 튐, 덴트, 눌림은 사진 한 장으로 놓치기 쉽습니다.",
    ],
  },
};

export const CONDITION_RUBRIC = [
  {
    value: "clean",
    label: "깨끗함",
    description: "육안과 확대에서 결함이 보이지 않음. 10 후보를 유지합니다.",
  },
  {
    value: "minor",
    label: "미세",
    description: "확대/빛 각도에서만 보이는 아주 작은 결함. 단독이면 리스크로 보고, 여러 개면 등급 하락 가능성을 반영합니다.",
  },
  {
    value: "visible",
    label: "보임",
    description: "일반 사진이나 정면 육안에서도 보이는 결함. 대체로 10 후보에서 제외합니다.",
  },
  {
    value: "severe",
    label: "심함",
    description: "깊은 찍힘, 큰 까짐, 강한 스크래치, 둥근 코너. 낮은 후보 등급까지 열어둡니다.",
  },
];
