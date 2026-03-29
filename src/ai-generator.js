import OpenAI from 'openai';

/**
 * AI 기반 블로그 콘텐츠 생성기
 */
export class AIContentGenerator {
  constructor(apiKey) {
    this.openai = new OpenAI({ apiKey });
  }

  /**
   * 블로그 글 생성
   */
  async generatePost(topic, options = {}) {
    const {
      style = 'informative',
      length = 'medium',
      includeEmoji = true,
    } = options;

    const lengthGuide = {
      short: '500자 내외',
      medium: '1000자 내외',
      long: '2000자 이상',
    };

    const systemPrompt = `당신은 전문 블로그 작가입니다.
한국어로 SEO에 최적화된 블로그 글을 작성합니다.
글은 ${style} 스타일로, ${lengthGuide[length]}로 작성해주세요.
${includeEmoji ? '적절한 이모지를 포함해주세요.' : '이모지는 사용하지 마세요.'}

결과물은 다음 JSON 형식으로 반환해주세요:
{
  "title": "SEO 최적화된 제목",
  "content": "HTML 형식의 본문 내용"
}`;

    const response = await this.openai.chat.completions.create({
      model: 'gpt-4o-mini',
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: `다음 주제로 블로그 글을 작성해주세요: ${topic}` },
      ],
      response_format: { type: 'json_object' },
      temperature: 0.7,
    });

    const result = JSON.parse(response.choices[0].message.content);
    console.log(`✅ 글 생성 완료: "${result.title}"`);

    return {
      title: result.title,
      content: this.formatForNaverBlog(result.content),
    };
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
