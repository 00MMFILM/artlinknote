module.exports = async function handler(req, res) {
  res.setHeader("Content-Type", "text/html; charset=utf-8");
  res.status(200).send(`<!DOCTYPE html>
<html lang="ko">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>아트링크 개인정보처리방침</title>
<style>
  body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; max-width: 700px; margin: 40px auto; padding: 0 20px; line-height: 1.8; color: #333; }
  h1 { font-size: 1.5rem; border-bottom: 2px solid #E8567F; padding-bottom: 8px; }
  h2 { font-size: 1.1rem; margin-top: 2rem; }
  .date { color: #888; font-size: 0.9rem; }
</style>
</head>
<body>
<h1>아트링크 개인정보처리방침</h1>
<p class="date">시행일: 2026년 2월 26일</p>

<h2>1. 수집하는 개인정보</h2>
<p>아트링크는 별도의 회원가입 없이 사용할 수 있으며, 서버에 개인정보를 수집·저장하지 않습니다. 모든 노트 데이터는 사용자의 기기에만 저장됩니다.</p>

<h2>2. 기기 접근 권한</h2>
<ul>
  <li><strong>카메라</strong>: 노트에 사진을 첨부하기 위해 사용 (선택)</li>
  <li><strong>사진 라이브러리</strong>: 노트에 이미지를 첨부하기 위해 사용 (선택)</li>
  <li><strong>마이크</strong>: 음성 메모를 녹음하기 위해 사용 (선택)</li>
</ul>
<p>위 권한은 사용자가 명시적으로 허용한 경우에만 접근하며, 촬영된 사진·영상·음성은 기기에만 저장됩니다.</p>

<h2>3. AI 분석 기능</h2>
<p>AI 분석 요청 시 노트 텍스트가 외부 AI 서비스(Anthropic Claude API)로 전송됩니다. 전송된 데이터는 분석 목적으로만 사용되며, 서버에 저장되지 않습니다.</p>

<h2>4. 매칭 피드</h2>
<p>매칭 피드는 공개된 캐스팅·공모전 정보를 수집하여 제공하며, 사용자의 개인정보와 연동되지 않습니다.</p>

<h2>5. 제3자 제공</h2>
<p>아트링크는 사용자의 개인정보를 제3자에게 제공하지 않습니다.</p>

<h2>6. 데이터 삭제</h2>
<p>앱을 삭제하면 기기에 저장된 모든 데이터가 함께 삭제됩니다.</p>

<h2>7. 문의</h2>
<p>개인정보 관련 문의: <a href="mailto:lcy1152@naver.com">lcy1152@naver.com</a></p>

<h2>8. 변경사항</h2>
<p>본 방침이 변경될 경우 앱 업데이트를 통해 안내합니다.</p>
</body>
</html>`);
};
