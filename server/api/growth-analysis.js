const { createClient } = require("@supabase/supabase-js");

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY
);

/**
 * 시계열 성장 궤적 분석 API
 *
 * POST: { userId, field, scores: [{ technique, expression, creativity, consistency, growth, createdAt }, ...] }
 *
 * Returns:
 * - trajectory: 각 항목별 변화율, 가속도
 * - pattern: 성장 궤적 패턴 분류
 * - potentialScore: 성장 잠재력 종합 점수
 * - vector: 특징 벡터
 */
module.exports = async (req, res) => {
  // CORS
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  if (req.method === "OPTIONS") return res.status(200).end();
  if (req.method !== "POST") return res.status(405).json({ error: "POST only" });

  try {
    const { userId, field, scores } = req.body;

    if (!userId || !field || !scores || !Array.isArray(scores)) {
      return res.status(400).json({ error: "userId, field, scores[] required" });
    }

    if (scores.length < 2) {
      return res.status(400).json({
        error: "최소 2개 이상의 기록이 필요합니다",
        minRequired: 2,
        current: scores.length,
      });
    }

    // 시간순 정렬
    const sorted = [...scores].sort(
      (a, b) => new Date(a.createdAt) - new Date(b.createdAt)
    );

    const dimensions = ["technique", "expression", "creativity", "consistency", "growth"];

    // ── 1. 각 항목별 변화율 & 가속도 계산 ──
    const trajectory = {};
    for (const dim of dimensions) {
      const values = sorted.map((s) => s[dim] || 0);
      const times = sorted.map((s) => new Date(s.createdAt).getTime());

      // 변화율 (첫 기록 → 마지막 기록 사이의 일평균 변화)
      const totalDays = (times[times.length - 1] - times[0]) / (1000 * 60 * 60 * 24);
      const totalChange = values[values.length - 1] - values[0];
      const changeRate = totalDays > 0 ? totalChange / totalDays : 0;

      // 구간별 변화율들
      const segmentRates = [];
      for (let i = 1; i < values.length; i++) {
        const days = (times[i] - times[i - 1]) / (1000 * 60 * 60 * 24);
        if (days > 0) {
          segmentRates.push((values[i] - values[i - 1]) / days);
        }
      }

      // 가속도 (변화율의 변화율)
      let acceleration = 0;
      if (segmentRates.length >= 2) {
        const firstHalf = segmentRates.slice(0, Math.floor(segmentRates.length / 2));
        const secondHalf = segmentRates.slice(Math.floor(segmentRates.length / 2));
        const avgFirst = firstHalf.reduce((a, b) => a + b, 0) / firstHalf.length;
        const avgSecond = secondHalf.reduce((a, b) => a + b, 0) / secondHalf.length;
        acceleration = avgSecond - avgFirst;
      }

      // 현재값 (마지막 기록)
      const current = values[values.length - 1];
      // 평균값
      const average = values.reduce((a, b) => a + b, 0) / values.length;
      // 표준편차 (일관성 측정)
      const variance = values.reduce((sum, v) => sum + Math.pow(v - average, 2), 0) / values.length;
      const stdDev = Math.sqrt(variance);

      trajectory[dim] = {
        current: round(current, 1),
        average: round(average, 2),
        changeRate: round(changeRate, 4),      // 일당 변화율
        acceleration: round(acceleration, 4),   // 변화율의 변화율
        stdDev: round(stdDev, 2),
        min: Math.min(...values),
        max: Math.max(...values),
        trend: changeRate > 0.01 ? "상승" : changeRate < -0.01 ? "하락" : "유지",
      };
    }

    // ── 2. 성장 궤적 패턴 분류 ──
    const pattern = classifyPattern(trajectory, sorted, dimensions);

    // ── 3. 성장 잠재력 종합 점수 산출 ──
    const potentialScore = calculatePotentialScore(trajectory, sorted.length, dimensions);

    // ── 4. 특징 벡터 생성 ──
    const vector = generateFeatureVector(trajectory, field, sorted.length, sorted);

    // ── 5. Supabase에 벡터 저장 (매칭용) ──
    const vectorData = {
      user_id: userId,
      field,
      vector,
      potential_score: potentialScore.total,
      pattern: pattern.type,
      trajectory_summary: {
        technique: trajectory.technique.current,
        expression: trajectory.expression.current,
        creativity: trajectory.creativity.current,
        consistency: trajectory.consistency.current,
        growth: trajectory.growth.current,
      },
      notes_count: sorted.length,
      updated_at: new Date().toISOString(),
    };

    await supabase
      .from("growth_vectors")
      .upsert(vectorData, { onConflict: "user_id,field" });

    return res.status(200).json({
      trajectory,
      pattern,
      potentialScore,
      vector,
      dataPoints: sorted.length,
      periodDays: round(
        (new Date(sorted[sorted.length - 1].createdAt) - new Date(sorted[0].createdAt)) /
          (1000 * 60 * 60 * 24),
        0
      ),
    });
  } catch (err) {
    console.error("Growth analysis error:", err);
    return res.status(500).json({ error: err.message });
  }
};

/**
 * 성장 궤적 패턴 분류
 */
function classifyPattern(trajectory, sorted, dimensions) {
  const avgChangeRate =
    dimensions.reduce((sum, d) => sum + trajectory[d].changeRate, 0) / dimensions.length;
  const avgAcceleration =
    dimensions.reduce((sum, d) => sum + trajectory[d].acceleration, 0) / dimensions.length;
  const avgStdDev =
    dimensions.reduce((sum, d) => sum + trajectory[d].stdDev, 0) / dimensions.length;

  // 특화형 체크: 한 항목만 두드러지게 성장
  const changeRates = dimensions.map((d) => trajectory[d].changeRate);
  const maxRate = Math.max(...changeRates);
  const otherRates = changeRates.filter((r) => r !== maxRate);
  const avgOther = otherRates.reduce((a, b) => a + b, 0) / otherRates.length;
  const isSpecialized = maxRate > 0.02 && maxRate > avgOther * 3;

  let type, description;

  if (isSpecialized) {
    const specialDim = dimensions[changeRates.indexOf(maxRate)];
    const dimNames = {
      technique: "기술력",
      expression: "표현력",
      creativity: "창의성",
      consistency: "일관성",
      growth: "성장도",
    };
    type = "specialized";
    description = `${dimNames[specialDim]} 특화 성장형: ${dimNames[specialDim]}에서 두드러진 발전을 보이고 있습니다`;
  } else if (avgAcceleration > 0.005) {
    type = "exponential";
    description = "지수 성장형: 성장 속도가 가속되고 있습니다. 높은 잠재력을 보여줍니다";
  } else if (avgChangeRate > 0.01 && avgStdDev < 1.5) {
    type = "linear";
    description = "선형 성장형: 꾸준하고 안정적인 성장세를 유지하고 있습니다";
  } else if (avgChangeRate > 0.01 && avgStdDev >= 1.5) {
    type = "volatile";
    description = "변동 성장형: 기복이 있으나 전체적으로 상승 추세입니다";
  } else if (avgChangeRate >= -0.01 && avgChangeRate <= 0.01) {
    type = "plateau";
    description = "고원형: 현재 수준에서 정체기에 있습니다. 새로운 도전이 필요한 시점입니다";
  } else {
    type = "declining";
    description = "조정기: 점수가 하락하고 있으나, 이는 새로운 도전의 과도기일 수 있습니다";
  }

  return {
    type,
    description,
    metrics: {
      avgChangeRate: round(avgChangeRate, 4),
      avgAcceleration: round(avgAcceleration, 4),
      avgStdDev: round(avgStdDev, 2),
    },
  };
}

/**
 * 성장 잠재력 종합 점수 (0-100)
 */
function calculatePotentialScore(trajectory, dataPoints, dimensions) {
  const weights = {
    currentLevel: 0.25,   // 현재 절대 수준
    changeRate: 0.30,      // 변화율 (성장 속도)
    acceleration: 0.25,    // 가속도 (성장의 성장)
    consistency: 0.20,     // 안정성 (낮은 표준편차)
  };

  // 현재 수준 점수 (10점 만점 → 100점 환산)
  const avgCurrent =
    dimensions.reduce((sum, d) => sum + trajectory[d].current, 0) / dimensions.length;
  const currentScore = (avgCurrent / 10) * 100;

  // 변화율 점수 (일당 +0.1 이상이면 100점)
  const avgRate =
    dimensions.reduce((sum, d) => sum + trajectory[d].changeRate, 0) / dimensions.length;
  const rateScore = Math.min(100, Math.max(0, (avgRate / 0.1) * 100));

  // 가속도 점수 (양의 가속도면 보너스)
  const avgAccel =
    dimensions.reduce((sum, d) => sum + trajectory[d].acceleration, 0) / dimensions.length;
  const accelScore = Math.min(100, Math.max(0, 50 + (avgAccel / 0.05) * 50));

  // 일관성 점수 (표준편차 낮을수록 높은 점수)
  const avgStdDev =
    dimensions.reduce((sum, d) => sum + trajectory[d].stdDev, 0) / dimensions.length;
  const consistencyScore = Math.max(0, 100 - avgStdDev * 20);

  // 데이터 충분성 보정 (기록이 많을수록 신뢰도 높음)
  const dataConfidence = Math.min(1, dataPoints / 10);

  const total = round(
    (currentScore * weights.currentLevel +
      rateScore * weights.changeRate +
      accelScore * weights.acceleration +
      consistencyScore * weights.consistency) *
      dataConfidence,
    1
  );

  return {
    total: Math.min(100, Math.max(0, total)),
    breakdown: {
      currentLevel: round(currentScore, 1),
      changeRate: round(rateScore, 1),
      acceleration: round(accelScore, 1),
      consistency: round(consistencyScore, 1),
    },
    confidence: round(dataConfidence * 100, 0),
  };
}

/**
 * 특징 벡터 생성 (13차원)
 * [분야코드, 기술력현재, 기술력변화율, 표현력현재, 표현력변화율,
 *  창의성현재, 창의성변화율, 일관성현재, 일관성변화율,
 *  성장도평균, 활동빈도, 총기록수, 활동기간(일)]
 */
function generateFeatureVector(trajectory, field, count, sorted) {
  const fieldCodes = {
    acting: 1,
    music: 2,
    dance: 3,
    musical: 4,
    art: 5,
    film: 6,
    other: 7,
  };

  const periodDays =
    (new Date(sorted[sorted.length - 1].createdAt) - new Date(sorted[0].createdAt)) /
    (1000 * 60 * 60 * 24);
  const frequency = periodDays > 0 ? count / periodDays : 0;

  return [
    fieldCodes[field] || 7,
    trajectory.technique.current,
    round(trajectory.technique.changeRate * 100, 2),  // 스케일링
    trajectory.expression.current,
    round(trajectory.expression.changeRate * 100, 2),
    trajectory.creativity.current,
    round(trajectory.creativity.changeRate * 100, 2),
    trajectory.consistency.current,
    round(trajectory.consistency.changeRate * 100, 2),
    trajectory.growth.average,
    round(frequency, 3),
    count,
    round(periodDays, 0),
  ];
}

function round(n, decimals) {
  const factor = Math.pow(10, decimals);
  return Math.round(n * factor) / factor;
}
