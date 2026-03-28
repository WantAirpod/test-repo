import 'dotenv/config';
import { NaverBlogClient, getAuthUrl } from './naver-blog.js';
import { AIContentGenerator, generateTopicIdeas } from './ai-generator.js';

// 환경변수 로드
const config = {
  naver: {
    clientId: process.env.NAVER_CLIENT_ID,
    clientSecret: process.env.NAVER_CLIENT_SECRET,
    accessToken: process.env.NAVER_BLOG_ACCESS_TOKEN,
    blogId: process.env.BLOG_ID,
  },
  openai: {
    apiKey: process.env.OPENAI_API_KEY,
  },
};

/**
 * 메인 실행 함수
 */
async function main() {
  const args = process.argv.slice(2);
  const command = args[0] || '--help';

  switch (command) {
    case '--generate':
      await generatePost(args[1]);
      break;

    case '--post':
      await generateAndPost(args[1]);
      break;

    case '--ideas':
      await showTopicIdeas(args[1]);
      break;

    case '--auth':
      showAuthUrl();
      break;

    case '--help':
    default:
      showHelp();
  }
}

/**
 * 글 생성만 (포스팅 X)
 */
async function generatePost(topic) {
  if (!topic) {
    console.log('❌ 주제를 입력해주세요: npm run generate "주제"');
    return;
  }

  const generator = new AIContentGenerator(config.openai.apiKey);
  const post = await generator.generatePost(topic, {
    style: 'informative',
    length: 'medium',
    includeEmoji: true,
  });

  console.log('\n📄 생성된 글:');
  console.log('━'.repeat(50));
  console.log(`제목: ${post.title}`);
  console.log('━'.repeat(50));
  console.log(post.content);
}

/**
 * 글 생성 + 네이버 블로그 포스팅
 */
async function generateAndPost(topic) {
  if (!topic) {
    console.log('❌ 주제를 입력해주세요: npm run post "주제"');
    return;
  }

  // 설정 확인
  if (!config.naver.accessToken) {
    console.log('❌ 네이버 Access Token이 설정되지 않았습니다.');
    console.log('   먼저 --auth로 인증 URL을 확인하고 토큰을 발급받으세요.');
    return;
  }

  // 글 생성
  console.log('🤖 AI가 글을 생성 중...');
  const generator = new AIContentGenerator(config.openai.apiKey);
  const post = await generator.generatePost(topic);

  // 네이버 블로그 포스팅
  console.log('📤 네이버 블로그에 포스팅 중...');
  const blogClient = new NaverBlogClient(config.naver);
  const result = await blogClient.writePost(post.title, post.content);

  console.log('\n🎉 포스팅 완료!');
  console.log(`   제목: ${post.title}`);
  console.log(`   URL: https://blog.naver.com/${config.naver.blogId}`);
}

/**
 * 주제 아이디어 생성
 */
async function showTopicIdeas(keyword) {
  if (!keyword) {
    console.log('❌ 키워드를 입력해주세요: node src/main.js --ideas "키워드"');
    return;
  }

  console.log(`💡 "${keyword}" 관련 주제 아이디어 생성 중...`);
  const topics = await generateTopicIdeas(config.openai.apiKey, keyword, 5);

  console.log('\n📋 추천 주제:');
  topics.forEach((topic, i) => {
    console.log(`   ${i + 1}. ${topic}`);
  });
}

/**
 * 네이버 인증 URL 표시
 */
function showAuthUrl() {
  if (!config.naver.clientId) {
    console.log('❌ NAVER_CLIENT_ID가 설정되지 않았습니다.');
    return;
  }

  const authUrl = getAuthUrl(
    config.naver.clientId,
    'http://localhost:3000/callback'
  );

  console.log('\n🔐 네이버 로그인 인증 URL:');
  console.log(authUrl);
  console.log('\n위 URL로 접속하여 인증 후, 콜백 URL의 code 파라미터를 사용하세요.');
}

/**
 * 도움말 표시
 */
function showHelp() {
  console.log(`
╔════════════════════════════════════════════════════╗
║       🚀 블로그 자동 생성기 (Blog Auto Generator)      ║
╚════════════════════════════════════════════════════╝

사용법:
  npm run generate "주제"    AI로 글 생성 (미리보기)
  npm run post "주제"        AI로 글 생성 + 네이버 블로그 포스팅

추가 명령:
  node src/main.js --ideas "키워드"   주제 아이디어 추천
  node src/main.js --auth             네이버 인증 URL 확인

설정:
  .env 파일에 API 키를 설정하세요.
  자세한 내용은 README.md를 참고하세요.
  `);
}

// 실행
main().catch(console.error);
