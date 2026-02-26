/**
 * communityService.js
 *
 * Community post management for Artlink React Native.
 * Handles local community post CRUD operations with default data.
 *
 * Posts are stored locally (AsyncStorage or equivalent).
 * This module provides the data layer; UI components consume it.
 */

import { generateUUID } from '../utils/helpers';

// ---------------------------------------------------------------------------
// Default Community Posts (seed data)
// ---------------------------------------------------------------------------

export const DEFAULT_COMMUNITY_POSTS = [
  {
    id: generateUUID(),
    authorName: '김하늘',
    authorField: 'acting',
    title: '오늘 감정씬 연습 후기',
    body: '오늘 슬픔에서 분노로 전환되는 장면을 연습했는데, 서브텍스트를 의식하니 감정의 흐름이 훨씬 자연스러워졌습니다. 특히 침묵 구간에서 내면 독백을 활용하니 파트너와의 호흡도 좋아진 느낌입니다.',
    tags: ['#감정씬', '#서브텍스트', '#연기연습'],
    field: 'acting',
    likes: 12,
    comments: [
      {
        id: generateUUID(),
        authorName: '이준서',
        body: '침묵 구간에서의 내면 독백 팁 좋네요! 저도 시도해볼게요.',
        createdAt: new Date(Date.now() - 3600000).toISOString(),
      },
    ],
    createdAt: new Date(Date.now() - 86400000).toISOString(),
    updatedAt: new Date(Date.now() - 86400000).toISOString(),
  },
  {
    id: generateUUID(),
    authorName: '박소율',
    authorField: 'music',
    title: '피아노 프레이징 연구',
    body: '쇼팽 녹턴을 연습하면서 프레이징에 집중했습니다. 왼손의 리듬을 안정적으로 유지하면서 오른손의 멜로디를 자유롭게 노래하는 연습을 했는데, 호흡을 의식하니 음악적 문장이 살아나는 느낌입니다.',
    tags: ['#피아노', '#프레이징', '#쇼팽'],
    field: 'music',
    likes: 8,
    comments: [],
    createdAt: new Date(Date.now() - 172800000).toISOString(),
    updatedAt: new Date(Date.now() - 172800000).toISOString(),
  },
  {
    id: generateUUID(),
    authorName: '최예린',
    authorField: 'dance',
    title: '현대무용 플로어워크 기록',
    body: '코어 안정성을 유지하면서 바닥과의 접촉면을 활용하는 연습을 했습니다. 무게 이동을 천천히 하면서 각 관절의 연결성을 느끼니, 움직임의 질감이 달라지는 것을 체감했습니다.',
    tags: ['#현대무용', '#플로어워크', '#코어'],
    field: 'dance',
    likes: 15,
    comments: [
      {
        id: generateUUID(),
        authorName: '정다인',
        body: '무게 이동 연습법 공유해주셔서 감사합니다!',
        createdAt: new Date(Date.now() - 7200000).toISOString(),
      },
    ],
    createdAt: new Date(Date.now() - 259200000).toISOString(),
    updatedAt: new Date(Date.now() - 259200000).toISOString(),
  },
  {
    id: generateUUID(),
    authorName: '윤서진',
    authorField: 'art',
    title: '수채화 색감 실험',
    body: '오늘 한정된 팔레트(3색)로만 풍경을 그려봤습니다. 색온도 차이를 극대화하면서 명도 변화로 공간감을 만들어내는 연습이었는데, 제한된 재료에서 더 많은 가능성을 발견할 수 있었습니다.',
    tags: ['#수채화', '#색채', '#한정팔레트'],
    field: 'art',
    likes: 20,
    comments: [],
    createdAt: new Date(Date.now() - 345600000).toISOString(),
    updatedAt: new Date(Date.now() - 345600000).toISOString(),
  },
  {
    id: generateUUID(),
    authorName: '한지우',
    authorField: 'literature',
    title: '단편소설 캐릭터 구축 노트',
    body: '주인공의 내적 갈등을 깊게 파고들면서 동기와 장애물의 관계를 정리했습니다. 인물의 과거사를 타임라인으로 정리하니 행동의 일관성이 명확해졌고, 독자에게 보여줄 순간과 감출 순간을 구분할 수 있게 되었습니다.',
    tags: ['#단편소설', '#캐릭터', '#서사구조'],
    field: 'literature',
    likes: 6,
    comments: [],
    createdAt: new Date(Date.now() - 432000000).toISOString(),
    updatedAt: new Date(Date.now() - 432000000).toISOString(),
  },
  {
    id: generateUUID(),
    authorName: '강민혁',
    authorField: 'film',
    title: '단편영화 조명 설계 메모',
    body: '오늘 인물의 심리 변화를 조명으로 표현하는 실험을 했습니다. 키라이트의 각도를 서서히 바꾸면서 얼굴의 명암 비율을 조절했는데, 관객이 의식하지 못하는 사이에 분위기가 전환되는 효과를 확인할 수 있었습니다.',
    tags: ['#단편영화', '#조명', '#분위기'],
    field: 'film',
    likes: 11,
    comments: [],
    createdAt: new Date(Date.now() - 518400000).toISOString(),
    updatedAt: new Date(Date.now() - 518400000).toISOString(),
  },
];

// ---------------------------------------------------------------------------
// In-memory store (to be replaced with AsyncStorage in production)
// ---------------------------------------------------------------------------

let _posts = [...DEFAULT_COMMUNITY_POSTS];
let _listeners = [];

/**
 * Notify all subscribers of a state change.
 */
function _notifyListeners() {
  for (const listener of _listeners) {
    try {
      listener([..._posts]);
    } catch (_e) {
      // swallow listener errors
    }
  }
}

// ---------------------------------------------------------------------------
// CRUD Operations
// ---------------------------------------------------------------------------

/**
 * Get all community posts, sorted by createdAt descending (newest first).
 *
 * @returns {Array} Copy of the posts array
 */
export function getPosts() {
  return [..._posts].sort(
    (a, b) => new Date(b.createdAt) - new Date(a.createdAt)
  );
}

/**
 * Get posts filtered by field.
 *
 * @param {string} field - Field key to filter by (e.g. 'acting', 'music')
 * @returns {Array}
 */
export function getPostsByField(field) {
  return getPosts().filter((p) => p.field === field);
}

/**
 * Get a single post by ID.
 *
 * @param {string} id
 * @returns {Object|null}
 */
export function getPostById(id) {
  return _posts.find((p) => p.id === id) || null;
}

/**
 * Create a new community post.
 *
 * @param {Object} params
 * @param {string} params.authorName
 * @param {string} params.authorField
 * @param {string} params.title
 * @param {string} params.body
 * @param {string[]} params.tags
 * @param {string} params.field
 * @returns {Object} The newly created post
 */
export function createPost({ authorName, authorField, title, body, tags = [], field }) {
  const now = new Date().toISOString();
  const newPost = {
    id: generateUUID(),
    authorName: authorName || '익명',
    authorField: authorField || field || 'acting',
    title: title || '',
    body: body || '',
    tags,
    field: field || 'acting',
    likes: 0,
    comments: [],
    createdAt: now,
    updatedAt: now,
  };

  _posts.unshift(newPost);
  _notifyListeners();
  return { ...newPost };
}

/**
 * Update an existing community post.
 *
 * @param {string} id        - Post ID
 * @param {Object} updates   - Fields to update (title, body, tags, field)
 * @returns {Object|null}    - The updated post, or null if not found
 */
export function updatePost(id, updates) {
  const index = _posts.findIndex((p) => p.id === id);
  if (index === -1) return null;

  _posts[index] = {
    ..._posts[index],
    ...updates,
    updatedAt: new Date().toISOString(),
  };

  _notifyListeners();
  return { ..._posts[index] };
}

/**
 * Delete a community post.
 *
 * @param {string} id
 * @returns {boolean} true if deleted, false if not found
 */
export function deletePost(id) {
  const prevLength = _posts.length;
  _posts = _posts.filter((p) => p.id !== id);

  if (_posts.length !== prevLength) {
    _notifyListeners();
    return true;
  }
  return false;
}

// ---------------------------------------------------------------------------
// Likes
// ---------------------------------------------------------------------------

/**
 * Toggle like on a post (increment/decrement).
 *
 * @param {string} postId
 * @param {boolean} isLiking - true to add a like, false to remove
 * @returns {Object|null} Updated post or null
 */
export function toggleLike(postId, isLiking = true) {
  const index = _posts.findIndex((p) => p.id === postId);
  if (index === -1) return null;

  if (isLiking) {
    _posts[index].likes = (_posts[index].likes || 0) + 1;
  } else {
    _posts[index].likes = Math.max((_posts[index].likes || 0) - 1, 0);
  }

  _notifyListeners();
  return { ..._posts[index] };
}

// ---------------------------------------------------------------------------
// Comments
// ---------------------------------------------------------------------------

/**
 * Add a comment to a post.
 *
 * @param {string} postId
 * @param {Object} params
 * @param {string} params.authorName
 * @param {string} params.body
 * @returns {Object|null} The new comment, or null if post not found
 */
export function addComment(postId, { authorName, body }) {
  const index = _posts.findIndex((p) => p.id === postId);
  if (index === -1) return null;

  const comment = {
    id: generateUUID(),
    authorName: authorName || '익명',
    body: body || '',
    createdAt: new Date().toISOString(),
  };

  _posts[index].comments = [...(_posts[index].comments || []), comment];
  _posts[index].updatedAt = new Date().toISOString();

  _notifyListeners();
  return { ...comment };
}

/**
 * Delete a comment from a post.
 *
 * @param {string} postId
 * @param {string} commentId
 * @returns {boolean}
 */
export function deleteComment(postId, commentId) {
  const index = _posts.findIndex((p) => p.id === postId);
  if (index === -1) return false;

  const prevLength = (_posts[index].comments || []).length;
  _posts[index].comments = (_posts[index].comments || []).filter(
    (c) => c.id !== commentId
  );

  if (_posts[index].comments.length !== prevLength) {
    _posts[index].updatedAt = new Date().toISOString();
    _notifyListeners();
    return true;
  }
  return false;
}

// ---------------------------------------------------------------------------
// Subscriptions
// ---------------------------------------------------------------------------

/**
 * Subscribe to post changes.
 *
 * @param {Function} listener - Called with the updated posts array
 * @returns {Function} Unsubscribe function
 */
export function subscribe(listener) {
  _listeners.push(listener);
  return () => {
    _listeners = _listeners.filter((l) => l !== listener);
  };
}

// ---------------------------------------------------------------------------
// Reset (for testing)
// ---------------------------------------------------------------------------

/**
 * Reset posts to default seed data.
 */
export function resetToDefaults() {
  _posts = [...DEFAULT_COMMUNITY_POSTS];
  _notifyListeners();
}

/**
 * Replace all posts (e.g. after loading from AsyncStorage).
 *
 * @param {Array} posts
 */
export function loadPosts(posts) {
  _posts = Array.isArray(posts) ? [...posts] : [...DEFAULT_COMMUNITY_POSTS];
  _notifyListeners();
}
