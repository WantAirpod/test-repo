import OpenAI from 'openai';
import { readFileSync, existsSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));

/**
 * CLAUDE.md 파일에서 블로그 규칙 로드 및 파싱
 */
function loadBlogRules() {
  const claudeMdPath = join(__dirname, '..', 'CLAUDE.md');

  if (existsSync(claudeMdPath)) {
    try {
      const content = readFileSync(claudeMdPath, 'utf-8');
      console.log('📋 CLAUDE.md 규칙 로드 완료');

      // CLAUDE.md 전체 내용을 그대로 반환 (상세 규칙 포함)
      return content;
    } catch (e) {
      console.log('⚠️ CLAUDE.md 읽기 실패:', e.message);
    }
  }

  return null;
}

/**
 * AI 기반 블로그 콘텐츠 생성기
 */
export class AIContentGenerator {
  constructor(apiKey) {
    this.openai = new OpenAI({ apiKey });
    this.blogRules = loadBlogRules();
  }

  /**
   * 블로그 글 생성
   */
  async generatePost(topic, options = {}) {
    const {
      includeEmoji = false,
    } = options;

    // CLAUDE.md 규칙 (필수)
    const rulesSection = this.blogRules || '';

    const systemPrompt = `당신은 제품을 직접 사용해본 실제 사용자입니다.
1인칭 시점으로 솔직한 사용 후기를 작성합니다.

【최우선 규칙 - 반드시 따라야 함】
${rulesSection}

【필수 요구사항】
- 글자수: 최소 3000자 이상 (매우 중요)
- AI 느낌 문장 절대 금지: "정리해드리겠습니다", "다음과 같습니다", "결론적으로" 등 사용 금지
- 1인칭 실사용 후기 형식: "제가 직접 써보니까...", "솔직히 처음엔...", "근데 써보니까..."
- 자연스러운 말투: ~더라구요, ~했거든요, ~인 것 같아요
- 장점뿐 아니라 단점도 솔직하게 포함
- 구매 링크 placeholder 포함: [구매링크: 쿠팡], [구매링크: 네이버]
- 가격 정보 포함
${includeEmoji ? '- 이모지 적절히 사용' : ''}

【HTML 포맷팅 규칙】
- 소제목: <h2> 또는 <h3> 태그 사용
- 문단: <p> 태그로 감싸기
- 문단 사이 여백: <br><br> 추가
- 강조: <strong> 또는 <b> 태그
- 리스트는 최소화하고 자연스러운 문장으로 작성

결과물은 다음 JSON 형식으로 반환:
{
  "title": "SEO 최적화된 제목 (키워드 포함)",
  "content": "HTML 형식의 본문 (3000자 이상)"
}`;

    const userPrompt = `다음 주제로 블로그 글을 작성해주세요: ${topic}

⚠️ 중요: 반드시 3000자 이상으로 작성하세요. 짧은 글은 허용되지 않습니다.

글 구조 (각 섹션 충분히 작성):
1. 도입부 (300자 이상): 자연스러운 인사 + 구매/사용 계기
2. 첫인상 및 디자인 (400자 이상): 실제 받았을 때 느낌, 외관 묘사
3. 사용 경험 (800자 이상): 실제 사용 상황, 장점 경험, 구체적 에피소드
4. 장점 정리 (400자 이상): 실사용 기반 장점들
5. 단점 및 아쉬운 점 (300자 이상): 솔직한 단점 (신뢰도 중요)
6. 가격 및 구매처 정보 (200자 이상): 현재 가격대, 구매 링크
7. 총평 및 추천 (400자 이상): 한줄 요약, 이런 사람에게 추천

각 섹션을 <h2> 또는 <h3> 소제목으로 구분하고, 충분한 분량으로 작성하세요.`;

    const response = await this.openai.chat.completions.create({
      model: 'gpt-4o',
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt },
      ],
      response_format: { type: 'json_object' },
      temperature: 0.85,
      max_tokens: 8000,  // 충분한 토큰 확보
    });

    let result = JSON.parse(response.choices[0].message.content);
    console.log(`✅ 글 생성 완료: "${result.title}"`);
    console.log(`   📏 글자수: 약 ${result.content.length}자`);

    // 글자수 부족 시 재시도
    if (result.content.length < 2500) {
      console.log('   ⚠️ 글자수 부족, 확장 요청 중...');

      const expandResponse = await this.openai.chat.completions.create({
        model: 'gpt-4o',
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userPrompt },
          { role: 'assistant', content: JSON.stringify(result) },
          { role: 'user', content: `글이 너무 짧습니다. 현재 ${result.content.length}자입니다. 각 섹션을 2-3배로 확장하여 최소 3500자 이상으로 다시 작성해주세요. 더 구체적인 경험, 디테일, 감정을 추가하세요.` },
        ],
        response_format: { type: 'json_object' },
        temperature: 0.85,
        max_tokens: 8000,
      });

      result = JSON.parse(expandResponse.choices[0].message.content);
      console.log(`   📏 확장 후 글자수: 약 ${result.content.length}자`);
    }

    return {
      title: result.title,
      content: this.enhanceFormatting(result.content),
    };
  }

  /**
   * HTML 포맷팅 강화
   */
  enhanceFormatting(content) {
    let enhanced = content;

    // 줄바꿈 정리
    enhanced = enhanced
      .replace(/\n\n/g, '</p><p>')
      .replace(/\n/g, '<br>');

    // p 태그 정리
    if (!enhanced.startsWith('<')) {
      enhanced = `<p>${enhanced}</p>`;
    }

    // 소제목 스타일 강화
    enhanced = enhanced
      .replace(/<h2>/g, '<h2 style="margin-top:30px;margin-bottom:15px;font-size:1.4em;">')
      .replace(/<h3>/g, '<h3 style="margin-top:25px;margin-bottom:12px;font-size:1.2em;">');

    // 문단 간격 추가
    enhanced = enhanced
      .replace(/<\/p><p>/g, '</p><br><p>');

    return enhanced;
  }

  /**
   * 여러 주제로 글 일괄 생성
   */
  async generateBulkPosts(topics, options = {}) {
    const results = [];

    for (const topic of topics) {
      console.log(`📝 생성 중: ${topic}`);
      const post = await this.generatePost(topic, options);
      results.push(post);
      await this.sleep(1000);
    }

    return results;
  }

  /**
   * 네이버 블로그용 HTML 포맷팅
   */
  formatForNaverBlog(content) {
    let formatted = content
      .replace(/\n\n/g, '</p><p>')
      .replace(/\n/g, '<br>');

    if (!formatted.startsWith('<p>')) {
      formatted = `<p>${formatted}</p>`;
    }

    return `<div class="se-main-container">${formatted}</div>`;
  }

  sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}

/**
 * 키워드 기반 주제 아이디어 생성
 */
export async function generateTopicIdeas(apiKey, keyword, count = 5) {
  const openai = new OpenAI({ apiKey });

  const response = await openai.chat.completions.create({
    model: 'gpt-4o-mini',
    messages: [
      {
        role: 'system',
        content: '블로그 주제 아이디어를 생성하는 전문가입니다. JSON 배열 형식으로 반환해주세요.',
      },
      {
        role: 'user',
        content: `"${keyword}" 관련 블로그 글 주제 ${count}개를 추천해주세요.
        {"topics": ["주제1", "주제2", ...]} 형식으로 응답해주세요.`,
      },
    ],
    response_format: { type: 'json_object' },
  });

  const result = JSON.parse(response.choices[0].message.content);
  return result.topics;
}
