const { fetchHTML, classifyField, cleanText, randomDelay, isTrainingContentValid } = require("../crawlerBase");

const SOURCE = "naverAPI";
const MAX_PER_QUERY = 10;

const SEARCH_QUERIES = {
  acting: [
    "연기 연습일지", "연기 수업 후기", "셀프테이프 연습", "연기 레슨 기록", "배우 훈련일지",
    "연기학원 수업 후기", "감정연기 연습", "즉흥연기 훈련", "대사 연습 방법", "오디션 준비 일지",
    "연극 리허설 후기", "메소드 연기 연습", "발성 발음 훈련 배우", "캐릭터 분석 노트", "연기 워크숍 후기",
  ],
  music: [
    "음악 연습일지", "보컬 레슨 후기", "악기 연습 기록", "피아노 연습 일지", "발성 연습 기록",
    "기타 연습 일지", "드럼 연습 기록", "작곡 작업일지", "노래 레슨 후기", "음악학원 수업 후기",
    "바이올린 연습 기록", "청음 훈련 일지", "밴드 합주 연습", "미디 작업 일지", "음악 입시 연습",
  ],
  dance: [
    "무용 연습일지", "댄스 연습 기록", "발레 레슨 후기", "현대무용 수업 후기", "안무 연습 일지",
    "한국무용 연습 기록", "스트릿댄스 연습", "댄스학원 수업 후기", "무용 입시 연습", "컨템포러리 댄스 기록",
    "왁킹 팝핑 연습", "댄스 대회 준비 일지", "몸풀기 스트레칭 루틴", "힙합댄스 연습 일지", "무용 워크숍 후기",
  ],
  art: [
    "미술 작업일지", "그림 연습 기록", "드로잉 일지", "수채화 연습 기록", "크로키 연습 일지",
    "유화 작업 기록", "디지털 드로잉 연습", "인체 드로잉 연습", "미술학원 수업 후기", "데생 연습 일지",
    "아크릴화 작업 기록", "일러스트 연습 일지", "미술 입시 연습", "색연필 드로잉 연습", "풍경화 스케치 기록",
  ],
  film: [
    "영화 촬영일지", "영상 제작 일지", "단편영화 제작기", "영화 편집 일지", "촬영 연습 기록",
    "시나리오 작성 일지", "영상 편집 작업 기록", "프리미어 편집 일지", "다빈치 리졸브 작업", "촬영 현장 후기",
    "독립영화 제작 일지", "유튜브 영상 제작기", "색보정 작업 기록", "다큐멘터리 제작 일지", "영화과 수업 후기",
  ],
  literature: [
    "글쓰기 연습", "소설 집필 일지", "창작 노트", "시 창작 기록", "글쓰기 수업 후기",
    "에세이 작성 기록", "문예창작 수업 후기", "단편소설 집필 일지", "자유글쓰기 연습", "필사 기록",
    "독서 감상 노트", "습작 일지", "문학 워크숍 후기", "시 쓰기 연습", "창작글 퇴고 기록",
  ],
};

// 광고 키워드 (API 설명 단계에서 빠르게 필터)
const AD_REJECT = [
  "광고 포함", "유료 광고", "협찬", "소정의 원고료", "소정의 수수료",
  "제품을 제공받", "쿠팡 파트너스", "쿠팡파트너스", "체험단", "리뷰단",
  "최저가", "할인코드", "쿠폰코드", "추천인코드",
];

// 네이버 검색 API로 블로그 글 검색
async function searchNaver(query, display = MAX_PER_QUERY) {
  const clientId = process.env.NAVER_CLIENT_ID;
  const clientSecret = process.env.NAVER_CLIENT_SECRET;
  if (!clientId || !clientSecret) return [];

  const url = `https://openapi.naver.com/v1/search/blog.json?query=${encodeURIComponent(query)}&display=${display}&sort=date`;
  const res = await fetch(url, {
    headers: {
      "X-Naver-Client-Id": clientId,
      "X-Naver-Client-Secret": clientSecret,
    },
  });

  if (!res.ok) throw new Error(`Naver API ${res.status}`);
  const data = await res.json();
  return data.items || [];
}

function stripHTML(str) {
  return (str || "").replace(/<[^>]+>/g, "").trim();
}

async function fetchBlogContent(url) {
  const fetchUrl = url.includes("blog.naver.com") && !url.includes("m.blog")
    ? url.replace("blog.naver.com", "m.blog.naver.com")
    : url;

  const $ = await fetchHTML(fetchUrl, { skipCache: true });

  if (url.includes("blog.naver.com") || url.includes("m.blog.naver.com")) {
    return cleanText($(".se-main-container, .post-view, #postViewArea, .se_component_wrap").first().text());
  } else if (url.includes("tistory.com")) {
    return cleanText($(".entry-content, .article-view, .tt_article_useless_p_margin, .contents_style").first().text());
  }
  return cleanText($("article, .post-content, .entry-content, main").first().text());
}

async function crawl({ fields, timeBudget = 45000 } = {}) {
  if (!process.env.NAVER_CLIENT_ID) {
    console.log("[naverAPI] Skipping — NAVER_CLIENT_ID not configured");
    return [];
  }

  const targetFields = fields || Object.keys(SEARCH_QUERIES);
  const results = [];
  const seen = new Set();
  const startTime = Date.now();

  for (const field of targetFields) {
    const queries = SEARCH_QUERIES[field];
    if (!queries) continue;

    for (const query of queries) {
      if (Date.now() - startTime > timeBudget) break;

      try {
        const items = await searchNaver(query, MAX_PER_QUERY);

        for (const item of items) {
          if (Date.now() - startTime > timeBudget) break;

          const blogUrl = item.link || "";
          if (!blogUrl || seen.has(blogUrl)) continue;
          seen.add(blogUrl);

          const apiTitle = stripHTML(item.title);
          const apiDesc = stripHTML(item.description);

          // 광고 키워드만 빠르게 필터 (길이 체크는 본문 추출 후)
          const fullText = `${apiTitle} ${apiDesc}`;
          if (AD_REJECT.some(kw => fullText.includes(kw))) continue;

          try {
            await randomDelay(300, 600);
            let content = await fetchBlogContent(blogUrl);

            // 본문 추출 실패 시 API 설명 사용
            if (!content || content.length < 200) content = apiDesc;

            if (!isTrainingContentValid(apiTitle, content)) continue;

            results.push({
              source: SOURCE,
              source_url: blogUrl,
              field: classifyField(`${apiTitle} ${content}`) || field,
              title: apiTitle || query,
              content: content.slice(0, 5000),
            });
          } catch {
            // 상세 페이지 실패 시 API 설명으로 시도
            if (isTrainingContentValid(apiTitle, apiDesc)) {
              results.push({
                source: SOURCE,
                source_url: blogUrl,
                field: classifyField(`${apiTitle} ${apiDesc}`) || field,
                title: apiTitle || query,
                content: apiDesc.slice(0, 5000),
              });
            }
          }
        }

        await randomDelay(200, 400);
      } catch (err) {
        console.error(`[naverAPI] Search failed for "${query}":`, err.message);
      }
    }
  }

  console.log(`[naverAPI] Collected ${results.length} items in ${((Date.now() - startTime) / 1000).toFixed(1)}s`);
  return results;
}

module.exports = { crawl, SOURCE };
