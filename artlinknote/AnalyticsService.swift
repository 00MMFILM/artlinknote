// GOAL: Artist profile analytics, related notes, and series detection.
// Pure Swift, no external dependencies. Operates on [Note] and UserProfile.

import Foundation

// MARK: - ArtistProfile Result
struct ArtistProfile {
    let streak: Int
    let fieldCounts: [Field: Int]
    let scores: SkillScores
    let weeklyStats: [WeeklyStat]
    let totalNotes: Int
}

struct SkillScores {
    let volume: Double      // 기록량 (0-100)
    let aiUsage: Double     // AI활용 (0-100)
    let diversity: Double   // 다양성 (0-100)
    let depth: Double       // 깊이 (0-100)
    let consistency: Double // 꾸준함 (0-100)
}

struct WeeklyStat: Identifiable {
    let id: String // "yyyy-Www"
    let weekStart: Date
    let count: Int
    let fields: Set<Field>
}

// MARK: - Analytics Functions

func computeArtistProfile(notes: [Note], profile: UserProfile) -> ArtistProfile {
    let streak = computeStreak(notes: notes)
    let fieldCounts = computeFieldCounts(notes: notes)
    let scores = computeSkillScores(notes: notes, profile: profile)
    let weeklyStats = computeWeeklyStats(notes: notes)

    return ArtistProfile(
        streak: streak,
        fieldCounts: fieldCounts,
        scores: scores,
        weeklyStats: weeklyStats,
        totalNotes: notes.count
    )
}

/// 오늘부터 거슬러 올라가며 연속 기록일 계산
private func computeStreak(notes: [Note]) -> Int {
    guard !notes.isEmpty else { return 0 }

    let calendar = Calendar.current
    let today = calendar.startOfDay(for: Date())

    // Collect unique days that have notes
    var daysWithNotes = Set<Date>()
    for note in notes {
        let day = calendar.startOfDay(for: note.updatedAt)
        daysWithNotes.insert(day)
    }

    // Count consecutive days from today backwards
    var streak = 0
    var checkDate = today

    while daysWithNotes.contains(checkDate) {
        streak += 1
        guard let previousDay = calendar.date(byAdding: .day, value: -1, to: checkDate) else { break }
        checkDate = previousDay
    }

    return streak
}

private func computeFieldCounts(notes: [Note]) -> [Field: Int] {
    var counts: [Field: Int] = [:]
    for note in notes {
        counts[note.field, default: 0] += 1
    }
    return counts
}

/// 5축 스킬 점수 계산 (각 0-100)
private func computeSkillScores(notes: [Note], profile: UserProfile) -> SkillScores {
    guard !notes.isEmpty else {
        return SkillScores(volume: 0, aiUsage: 0, diversity: 0, depth: 0, consistency: 0)
    }

    // 1. 기록량 (Volume): 총 노트 수 기반, 100개에서 만점
    let volume = min(Double(notes.count) / 100.0 * 100.0, 100.0)

    // 2. AI활용 (AI Usage): aiComment가 있는 노트 비율
    let aiCount = notes.filter { $0.aiComment != nil && !($0.aiComment?.isEmpty ?? true) }.count
    let aiUsage = min(Double(aiCount) / Double(notes.count) * 100.0, 100.0)

    // 3. 다양성 (Diversity): 사용한 field 수 / 전체 field 수
    let uniqueFields = Set(notes.map(\.field))
    let diversity = Double(uniqueFields.count) / Double(Field.allCases.count) * 100.0

    // 4. 깊이 (Depth): 평균 본문 길이 기반, 500자 이상이면 만점
    let avgBodyLength = notes.map(\.body.count).reduce(0, +) / notes.count
    let depth = min(Double(avgBodyLength) / 500.0 * 100.0, 100.0)

    // 5. 꾸준함 (Consistency): 최근 30일 중 노트를 쓴 날의 비율
    let calendar = Calendar.current
    let thirtyDaysAgo = calendar.date(byAdding: .day, value: -30, to: Date()) ?? Date()
    let recentNotes = notes.filter { $0.updatedAt >= thirtyDaysAgo }
    let recentDays = Set(recentNotes.map { calendar.startOfDay(for: $0.updatedAt) })
    let consistency = min(Double(recentDays.count) / 30.0 * 100.0, 100.0)

    return SkillScores(
        volume: volume,
        aiUsage: aiUsage,
        diversity: diversity,
        depth: depth,
        consistency: consistency
    )
}

private func computeWeeklyStats(notes: [Note]) -> [WeeklyStat] {
    let calendar = Calendar.current
    var weekMap: [String: (date: Date, count: Int, fields: Set<Field>)] = [:]

    for note in notes {
        let components = calendar.dateComponents([.yearForWeekOfYear, .weekOfYear], from: note.updatedAt)
        guard let year = components.yearForWeekOfYear, let week = components.weekOfYear else { continue }
        let key = "\(year)-W\(String(format: "%02d", week))"
        let weekStart = calendar.date(from: components) ?? note.updatedAt

        if var existing = weekMap[key] {
            existing.count += 1
            existing.fields.insert(note.field)
            weekMap[key] = existing
        } else {
            weekMap[key] = (date: weekStart, count: 1, fields: [note.field])
        }
    }

    return weekMap.map { key, value in
        WeeklyStat(id: key, weekStart: value.date, count: value.count, fields: value.fields)
    }.sorted { $0.weekStart < $1.weekStart }
}

// MARK: - Related Notes

/// 관련 노트 추천 (field, tags, series, title 유사도 기반)
func getRelatedNotes(note: Note, allNotes: [Note], maxResults: Int = 5) -> [(note: Note, score: Double)] {
    var scored: [(note: Note, score: Double)] = []

    for candidate in allNotes {
        guard candidate.id != note.id else { continue }
        var score = 0.0

        // Same field: +3
        if candidate.field == note.field {
            score += 3.0
        }

        // Shared tags
        let sharedTags = Set(note.tags).intersection(Set(candidate.tags))
        score += Double(sharedTags.count) * 2.0

        // Same series: +5
        if let series = note.seriesName, !series.isEmpty, candidate.seriesName == series {
            score += 5.0
        }

        // Title similarity (Jaccard on words)
        let noteWords = Set(note.title.lowercased().components(separatedBy: .whitespacesAndNewlines).filter { $0.count >= 2 })
        let candidateWords = Set(candidate.title.lowercased().components(separatedBy: .whitespacesAndNewlines).filter { $0.count >= 2 })
        if !noteWords.isEmpty && !candidateWords.isEmpty {
            let intersection = noteWords.intersection(candidateWords).count
            let union = noteWords.union(candidateWords).count
            let jaccard = Double(intersection) / Double(union)
            score += jaccard * 4.0
        }

        // Recency bonus (more recent = slight boost)
        let daysSinceUpdate = Date().timeIntervalSince(candidate.updatedAt) / 86400
        if daysSinceUpdate < 7 { score += 1.0 }
        else if daysSinceUpdate < 30 { score += 0.5 }

        if score > 0 {
            scored.append((note: candidate, score: score))
        }
    }

    return scored
        .sorted { $0.score > $1.score }
        .prefix(maxResults)
        .map { $0 }
}

// MARK: - Series Detection

/// 시리즈 자동 감지: seriesName이 같은 노트를 그룹핑
func getNoteSeries(allNotes: [Note]) -> [String: [Note]] {
    var seriesMap: [String: [Note]] = [:]

    for note in allNotes {
        if let series = note.seriesName, !series.isEmpty {
            seriesMap[series, default: []].append(note)
        }
    }

    // Also detect implicit series by common title prefixes (e.g. "Act 1:", "Act 2:")
    let unseriedNotes = allNotes.filter { $0.seriesName == nil || $0.seriesName?.isEmpty == true }
    var prefixGroups: [String: [Note]] = [:]

    for note in unseriedNotes {
        // Try to extract a prefix before common separators
        let separators = [":", " -", " –", " —", "#", " |"]
        for sep in separators {
            if let range = note.title.range(of: sep) {
                let prefix = String(note.title[..<range.lowerBound]).trimmed()
                if prefix.count >= 2 && prefix.count <= 30 {
                    prefixGroups[prefix, default: []].append(note)
                }
                break
            }
        }
    }

    // Only keep prefix groups with 2+ notes
    for (prefix, notes) in prefixGroups where notes.count >= 2 {
        let key = "\(prefix) (auto)"
        seriesMap[key] = notes
    }

    // Sort notes within each series by updatedAt
    for key in seriesMap.keys {
        seriesMap[key]?.sort { $0.updatedAt < $1.updatedAt }
    }

    return seriesMap
}
