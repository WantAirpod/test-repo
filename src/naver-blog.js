import axios from 'axios';

/**
 * 네이버 블로그 API 클라이언트
 *
 * 네이버 Open API 사용을 위해 필요한 것:
 * 1. https://developers.naver.com 에서 애플리케이션 등록
 * 2. 블로그 글쓰기 API 권한 신청
 * 3. OAuth 인증으로 access_token 발급
 */
export class NaverBlogClient {
  constructor(config) {
    this.clientId = config.clientId;
    this.clientSecret = config.clientSecret;
    this.accessToken = config.accessToken;
    this.blogId = config.blogId;
    this.baseUrl = 'https://openapi.naver.com';
  }

  /**
   * 블로그 글 작성
   * @param {string} title - 글 제목
   * @param {string} contents - 글 내용 (HTML 지원)
   * @param {string} categoryNo - 카테고리 번호 (선택)
   * @returns {Promise<object>} - 포스팅 결과
   */
  async writePost(title, contents, categoryNo = '') {
    const url = `${this.baseUrl}/blog/writePost.json`;

    const params = new URLSearchParams();
    params.append('title', title);
    params.append('contents', contents);
    if (categoryNo) {
      params.append('categoryNo', categoryNo);
    }

    try {
      const response = await axios.post(url, params, {
        headers: {
          'Authorization': `Bearer ${this.accessToken}`,
          'Content-Type': 'application/x-www-form-urlencoded',
        },
      });

      console.log('✅ 블로그 포스팅 성공!');
      return response.data;
    } catch (error) {
      console.error('❌ 블로그 포스팅 실패:', error.response?.data || error.message);
      throw error;
    }
  }

  /**
   * 블로그 카테고리 목록 조회
   * @returns {Promise<object>} - 카테고리 목록
   */
  async getCategories() {
    const url = `${this.baseUrl}/blog/listCategory.json`;

    try {
      const response = await axios.get(url, {
        headers: {
          'Authorization': `Bearer ${this.accessToken}`,
        },
      });

      return response.data;
    } catch (error) {
      console.error('❌ 카테고리 조회 실패:', error.response?.data || error.message);
      throw error;
    }
  }
}

/**
 * OAuth 인증 URL 생성 (최초 토큰 발급용)
 */
export function getAuthUrl(clientId, redirectUri, state = 'random_state') {
  const baseUrl = 'https://nid.naver.com/oauth2.0/authorize';
  const params = new URLSearchParams({
    response_type: 'code',
    client_id: clientId,
    redirect_uri: redirectUri,
    state: state,
  });

  return `${baseUrl}?${params.toString()}`;
}

/**
 * Authorization Code로 Access Token 발급
 */
export async function getAccessToken(clientId, clientSecret, code, state) {
  const url = 'https://nid.naver.com/oauth2.0/token';
  const params = new URLSearchParams({
    grant_type: 'authorization_code',
    client_id: clientId,
    client_secret: clientSecret,
    code: code,
    state: state,
  });

  const response = await axios.post(url, params);
  return response.data;
}
