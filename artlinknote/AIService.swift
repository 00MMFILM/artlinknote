// GOAL: Server-proxy AI service for note analysis.
// - Routes through Vercel serverless proxy (no API key on device)
// - 6 field-specific AI prompts (acting, music, art, dance, literature, film)
// - buildAIPrompt with history/personal/progress context
// - analyzeNote with heuristic fallback
// No external deps. Async/await.

import Foundation

// MARK: - Config
enum AIConfig {
    static var serverURL: String {
        ProcessInfo.processInfo.environment["ARTLINK_SERVER_URL"]
            ?? "https://artlink-server.vercel.app"
    }
}

// MARK: - AI Errors
enum AIError: Error, LocalizedError {
    case networkTimeout
    case serverError(Int)
    case decodingFailed
    case emptyResponse
    case unknown

    var errorDescription: String? {
        switch self {
        case .networkTimeout: return "요청 시간이 초과되었습니다. 연결을 확인해주세요."
        case .serverError(let code): return "서버 오류 (\(code)). 다시 시도해주세요."
        case .decodingFailed: return "응답을 처리할 수 없습니다."
        case .emptyResponse: return "AI 응답이 비어있습니다."
        case .unknown: return "예기치 않은 오류가 발생했습니다."
        }
    }
}

// MARK: - Server Response
private struct AIAnalyzeResponse: Codable {
    let result: String
}

// MARK: - Field-Specific AI Prompts
let FIELD_AI_PROMPTS: [Field: String] = [
    .acting: """
    당신은 스타니슬랍스키 시스템과 마이즈너 테크닉에 정통한 연기 코치입니다.
    배우의 연습 노트를 분석하여 다음을 중점적으로 피드백해주세요:
    - 감정곡선: 장면 속 감정의 흐름과 변화 지점
    - 서브텍스트: 대사 이면의 숨겨진 의도와 욕구
    - 비트 분석: 장면의 전환점과 행동 단위
    - 캐릭터의 목표(objective)와 장애물(obstacle) 관계
    """,
    .music: """
    당신은 음악 전문 코치입니다. 연습 노트를 분석하여 다음을 중점적으로 피드백해주세요:
    - 음정(pitch): 정확도와 음정 이동의 자연스러움
    - 리듬(rhythm): 박자감, 싱코페이션, 그루브
    - 다이내믹(dynamics): 강약 조절, 크레센도/디크레센도 활용
    - 프레이징(phrasing): 음악적 문장 구성과 호흡
    """,
    .art: """
    당신은 미술 전문 코치입니다. 작업 노트를 분석하여 다음을 중점적으로 피드백해주세요:
    - 구도(composition): 화면 구성, 시선 유도, 균형
    - 색채(color): 색 조합, 색온도, 대비
    - 질감(texture): 표면 처리, 붓터치, 재료 활용
    - 명암(value): 빛과 그림자, 입체감 표현
    """,
    .dance: """
    당신은 무용 전문 코치이며 라반 무보법(Laban Movement Analysis)에 정통합니다.
    연습 노트를 분석하여 다음을 중점적으로 피드백해주세요:
    - 코어(core): 중심 근력과 안정성
    - 공간(space): 키네스피어(kinesphere) 활용, 레벨 변화
    - 무게이동(weight shift): 체중 이동의 질감과 흐름
    - 신체 연결성과 움직임의 흐름(flow)
    """,
    .literature: """
    당신은 문학 전문 코치입니다. 창작 노트를 분석하여 다음을 중점적으로 피드백해주세요:
    - 서사(narrative): 이야기 구조, 플롯 전개, 갈등 설정
    - 캐릭터(character): 인물의 깊이, 동기, 성장 곡선
    - 문체(style): 문장 리듬, 단어 선택, 톤 일관성
    - 은유(metaphor): 상징과 비유의 효과적 활용
    """,
    .film: """
    당신은 영화 전문 코치입니다. 작업 노트를 분석하여 다음을 중점적으로 피드백해주세요:
    - 앵글(angle): 카메라 위치, 샷 사이즈, 화면 구성
    - 조명(lighting): 조명 설계, 분위기 연출
    - 편집(editing): 컷의 리듬, 장면 전환, 몽타주
    - 사운드(sound): 음향 설계, 음악 활용, 침묵의 활용
    """
]

// MARK: - Feedback Format
private let feedbackFormatInstruction = """

피드백 형식 (반드시 지켜주세요):
📌 전체 인상 (2문장)
💪 강점 (2-3문장)
🎯 개선 포인트 (2-3문장)
{rolemodelSection}
{growthSection}
🔜 다음 스텝 (1-2문장)

500-700자, 한국어, 따뜻하지만 전문적인 톤으로 작성하세요.
"""

// MARK: - Build AI Prompt

func buildAIPrompt(
    field: Field,
    content: String,
    savedNotes: [Note],
    userProfile: UserProfile
) -> (systemPrompt: String, userMessage: String) {
    let basePrompt = FIELD_AI_PROMPTS[field] ?? FIELD_AI_PROMPTS[.acting]!

    // History context: 같은 분야 최근 3개 노트의 AI 피드백
    let sameFieldNotes = savedNotes
        .filter { $0.field == field && $0.aiComment != nil && !($0.aiComment?.isEmpty ?? true) }
        .sorted { $0.updatedAt > $1.updatedAt }
        .prefix(3)

    var historyContext = ""
    if !sameFieldNotes.isEmpty {
        historyContext = "\n\n[이전 피드백 히스토리]\n"
        for (i, note) in sameFieldNotes.enumerated() {
            historyContext += "\(i + 1). \(note.title): \(note.aiComment?.prefix(100) ?? "")...\n"
        }
    }

    // Personal context: 롤모델, 관심사
    var personalContext = ""
    if !userProfile.roleModels.isEmpty {
        personalContext += "\n\n[사용자 롤모델] \(userProfile.roleModels.joined(separator: ", "))"
    }
    if !userProfile.interests.isEmpty {
        personalContext += "\n[사용자 관심분야] \(userProfile.interests.joined(separator: ", "))"
    }

    // Progress context: streak, 총 노트 수
    let artistProfile = computeArtistProfile(notes: savedNotes, profile: userProfile)
    let progressContext = "\n\n[성장 현황] 연속 기록 \(artistProfile.streak)일, 총 \(artistProfile.totalNotes)개 노트"

    // Build format section
    let hasRoleModels = !userProfile.roleModels.isEmpty
    let hasPreviousNotes = !sameFieldNotes.isEmpty

    var formatStr = feedbackFormatInstruction
    formatStr = formatStr.replacingOccurrences(
        of: "{rolemodelSection}",
        with: hasRoleModels ? "🎨 롤모델 연결 (1-2문장)" : ""
    )
    formatStr = formatStr.replacingOccurrences(
        of: "{growthSection}",
        with: hasPreviousNotes ? "📈 성장 트래킹 (1-2문장)" : ""
    )

    let systemPrompt = basePrompt + historyContext + personalContext + progressContext + formatStr
    let userMessage = "다음은 \(field.label) 분야 연습 노트입니다:\n\n\(content)"

    return (systemPrompt: systemPrompt, userMessage: userMessage)
}

// MARK: - Analyze Note (Server Proxy)

func analyzeNote(
    field: Field,
    content: String,
    savedNotes: [Note],
    userProfile: UserProfile
) async -> String {
    let (systemPrompt, userMessage) = buildAIPrompt(
        field: field,
        content: content,
        savedNotes: savedNotes,
        userProfile: userProfile
    )

    do {
        return try await requestAIAnalysis(systemPrompt: systemPrompt, userMessage: userMessage)
    } catch {
        return heuristicFallback(field: field, content: content)
    }
}

/// POST /api/ai-analyze to server proxy
private func requestAIAnalysis(systemPrompt: String, userMessage: String) async throws -> String {
    guard let url = URL(string: "\(AIConfig.serverURL)/api/ai-analyze") else {
        throw AIError.unknown
    }

    var request = URLRequest(url: url)
    request.httpMethod = "POST"
    request.setValue("application/json", forHTTPHeaderField: "Content-Type")
    request.timeoutInterval = 30.0

    let body: [String: String] = [
        "systemPrompt": systemPrompt,
        "userMessage": userMessage
    ]
    request.httpBody = try JSONSerialization.data(withJSONObject: body)

    let (data, response) = try await URLSession.shared.data(for: request)

    if let httpResponse = response as? HTTPURLResponse {
        guard httpResponse.statusCode == 200 else {
            throw AIError.serverError(httpResponse.statusCode)
        }
    }

    let decoded = try JSONDecoder().decode(AIAnalyzeResponse.self, from: data)
    guard !decoded.result.isEmpty else { throw AIError.emptyResponse }
    return decoded.result
}

// MARK: - Heuristic Fallback

private func heuristicFallback(field: Field, content: String) -> String {
    let isKorean = content.range(of: "[\u{AC00}-\u{D7A3}]", options: .regularExpression) != nil

    // Extract keywords for basic feedback
    let words = content.lowercased()
        .components(separatedBy: CharacterSet.alphanumerics.inverted)
        .filter { $0.count >= 2 }

    let stopwords: Set<String> = isKorean
        ? ["이", "그", "저", "것", "수", "등", "들", "에", "의", "를", "을", "가", "는", "은", "하다", "되다", "있다", "없다"]
        : ["the", "a", "an", "is", "are", "was", "were", "be", "have", "has", "had", "do", "does", "did", "and", "or", "but", "in", "on", "at", "to", "for", "of", "with"]

    var freq: [String: Int] = [:]
    for word in words where !stopwords.contains(word) {
        freq[word, default: 0] += 1
    }
    let topKeywords = freq.sorted { $0.value > $1.value }.prefix(5).map(\.key)
    let keywordStr = topKeywords.isEmpty ? "내용" : topKeywords.joined(separator: ", ")

    let wordCount = words.count
    let lengthComment: String
    if wordCount > 200 {
        lengthComment = "풍부한 분량의 기록이네요."
    } else if wordCount > 50 {
        lengthComment = "적절한 분량의 기록입니다."
    } else {
        lengthComment = "좀 더 자세히 기록하면 더 깊은 분석이 가능합니다."
    }

    return """
    📌 전체 인상
    \(field.emoji) \(field.label) 분야의 연습 노트를 분석했습니다. \(lengthComment)

    💪 강점
    \(keywordStr)에 대한 관찰이 돋보입니다. 구체적인 기록 습관이 좋습니다.

    🎯 개선 포인트
    더 구체적인 감각 묘사를 추가해보세요. 무엇을 느꼈는지, 어떤 변화가 있었는지 기록하면 성장에 도움이 됩니다.

    🔜 다음 스텝
    오늘 발견한 포인트를 다음 연습에서 의식적으로 적용해보세요.
    """
}
