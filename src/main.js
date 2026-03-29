import 'dotenv/config';
import { NaverBlogClient } from './naver-blog.js';
import { TistoryBlogClient } from './tistory-blog.js';
import { AIContentGenerator, generateTopicIdeas } from './ai-generator.js';
import { ImageExtractor, extractProductInfo } from './image-extractor.js';
import { BlogScraper, searchBlogImages } from './blog-scraper.js';

// 환경변수 로드
const config = {
  naver: {
    naverId: process.env.NAVER_ID,
    naverPw: process.env.NAVER_PW,
    blogId: process.env.BLOG_ID,
  },
  tistory: {
    blogName: process.env.TISTORY_BLOG, // 티스토리 블로그 이름 (예: myblog)
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

    case '--tistory':
      await generateAndPostTistory(args[1], args[2]); // args[2] = 이미지 URL (선택)
      break;

    case '--ideas':
      await showTopicIdeas(args[1]);
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
 * 글 생성 + 네이버 블로그 포스팅 (Puppeteer)
 */
async function generateAndPost(topic) {
  if (!topic) {
    console.log('❌ 주제를 입력해주세요: npm run post "주제"');
    return;
  }

  // 설정 확인
  if (!config.naver.naverId || !config.naver.naverPw) {
    console.log('❌ 네이버 로그인 정보가 설정되지 않았습니다.');
    console.log('   .env 파일에 NAVER_ID와 NAVER_PW를 설정하세요.');
    return;
  }

  // 글 생성
  console.log('🤖 AI가 글을 생성 중...');
  const generator = new AIContentGenerator(config.openai.apiKey);
  const post = await generator.generatePost(topic);

  console.log('\n📄 생성된 글:');
  console.log(`   제목: ${post.title}`);

  // 네이버 블로그 포스팅 (Puppeteer)
  console.log('\n📤 네이버 블로그에 포스팅 시작...');
  console.log('');
  console.log('╔════════════════════════════════════════════════════╗');
  console.log('║  ⚠️  자동화 진행 중 브라우저를 건드리지 마세요!      ║');
  console.log('║  ⚠️  캡차/인증이 필요할 때만 브라우저에서 처리하세요. ║');
  console.log('╚════════════════════════════════════════════════════╝');

  const blogClient = new NaverBlogClient(config.naver);

  try {
    // 1단계: 브라우저 시작
    await blogClient.init();

    // 2단계: 로그인
    await blogClient.login();

    // 3단계: 글쓰기 페이지로 이동
    await blogClient.goToEditor();

    // 4단계: 글 작성
    const writeResult = await blogClient.writePost(post.title, post.content);
    if (!writeResult.success) {
      console.log('❌ 글 작성 실패. 브라우저에서 직접 작성해주세요.');
      return;
    }

    // 5단계: 발행
    const publishResult = await blogClient.publish();
    if (publishResult.success) {
      console.log('');
      console.log('✅ 모든 작업이 완료되었습니다!');
    } else {
      console.log('');
      console.log('⚠️  발행을 완료하지 못했습니다. 브라우저에서 직접 확인해주세요.');
    }

  } catch (error) {
    console.error('❌ 포스팅 중 오류 발생:', error.message);
    console.log('   브라우저에서 직접 확인 후 처리해주세요.');
  }

  // 브라우저는 열어둠 (수동 확인용)
  console.log('');
  console.log('💡 완료 후 브라우저를 닫으면 프로그램이 종료됩니다.');
}

/**
 * 글 생성 + 티스토리 블로그 포스팅 (Puppeteer)
 * @param {string} topic - 주제
 * @param {string} imageUrl - 이미지를 추출할 URL (선택)
 */
async function generateAndPostTistory(topic, imageUrl) {
  if (!topic) {
    console.log('❌ 주제를 입력해주세요: npm run tistory "주제"');
    console.log('   이미지 포함: npm run tistory "주제" "이미지URL"');
    return;
  }

  // 설정 확인
  if (!config.tistory.blogName) {
    console.log('❌ 티스토리 블로그 이름이 설정되지 않았습니다.');
    console.log('   .env 파일에 TISTORY_BLOG를 설정하세요.');
    console.log('   예: TISTORY_BLOG=myblog  (https://myblog.tistory.com)');
    return;
  }

  let images = [];
  let references = [];

  // 이미지 추출
  if (imageUrl) {
    // 방법 1: 특정 URL에서 이미지 추출
    console.log('🖼️  URL에서 이미지 추출 중...');
    try {
      const extractor = new ImageExtractor();
      await extractor.init();
      images = await extractor.extractImages(imageUrl, 5);
      await extractor.close();
      console.log(`   ✓ ${images.length}개 이미지 추출 완료`);
    } catch (error) {
      console.log(`   ⚠️ 이미지 추출 실패: ${error.message}`);
    }
  } else {
    // 방법 2: 자동으로 관련 블로그 검색하여 이미지 추출 (최소 10개 참고)
    console.log('🔍 관련 블로그에서 이미지 및 참고자료 검색 중...');
    try {
      const scraper = new BlogScraper();
      await scraper.init();
      const searchResults = await scraper.searchAndExtract(topic, 10, 5); // 10개 블로그 참고
      await scraper.close();

      images = searchResults.images;
      references = searchResults.references;

      if (images.length > 0) {
        console.log(`   ✓ ${images.length}개 이미지 수집 완료`);
      }
      if (references.length > 0) {
        console.log(`   ✓ ${references.length}개 블로그 참고`);
      }
    } catch (error) {
      console.log(`   ⚠️ 블로그 검색 실패: ${error.message}`);
      console.log('   → 이미지 없이 진행합니다.');
    }
  }

  // 글 생성 (참고 내용 포함)
  console.log('🤖 AI가 글을 생성 중...');
  const generator = new AIContentGenerator(config.openai.apiKey);

  // 참고 내용이 있으면 주제에 포함
  let enrichedTopic = topic;
  if (references.length > 0) {
    const refText = references.map(r => r.summary).join('\n\n');
    enrichedTopic = `${topic}\n\n[참고할 내용]\n${refText}`;
  }

  const post = await generator.generatePost(enrichedTopic);

  console.log('\n📄 생성된 글:');
  console.log(`   제목: ${post.title}`);
  if (images.length > 0) {
    console.log(`   이미지: ${images.length}개`);
  }

  // 티스토리 블로그 포스팅
  console.log('\n📤 티스토리 블로그에 포스팅 시작...');
  console.log('');
  console.log('╔════════════════════════════════════════════════════╗');
  console.log('║  ⚠️  자동화 진행 중 브라우저를 건드리지 마세요!      ║');
  console.log('╚════════════════════════════════════════════════════╝');

  const blogClient = new TistoryBlogClient(config.tistory);

  try {
    // 1단계: 브라우저 연결
    await blogClient.init();

    // 2단계: 로그인 확인
    await blogClient.login();

    // 3단계: 글쓰기 페이지로 이동
    await blogClient.goToEditor();

    // 4단계: 글 작성 (이미지 포함)
    const writeResult = await blogClient.writePost(post.title, post.content, images);
    if (!writeResult.success) {
      console.log('❌ 글 작성 실패. 브라우저에서 직접 작성해주세요.');
      return;
    }

    // 5단계: 발행
    const publishResult = await blogClient.publish();
    if (publishResult.success) {
      console.log('');
      console.log('✅ 모든 작업이 완료되었습니다!');
    } else {
      console.log('');
      console.log('⚠️  발행을 완료하지 못했습니다. 브라우저에서 직접 확인해주세요.');
    }

  } catch (error) {
    console.error('❌ 포스팅 중 오류 발생:', error.message);
    console.log('   브라우저에서 직접 확인 후 처리해주세요.');
  }

  console.log('');
  console.log('💡 완료 후 탭을 닫아도 됩니다.');
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
 * 도움말 표시
 */
function showHelp() {
  console.log(`
╔════════════════════════════════════════════════════╗
║       🚀 블로그 자동 생성기 (Blog Auto Generator)      ║
╚════════════════════════════════════════════════════╝

사용법:
  npm run chrome              Chrome 디버깅 모드 시작 (먼저 실행!)
  npm run post "주제"         네이버 블로그 포스팅
  npm run tistory "주제"      티스토리 블로그 포스팅
  npm run generate "주제"     AI로 글 생성 (미리보기)

추가 명령:
  node src/main.js --ideas "키워드"   주제 아이디어 추천

설정 (.env 파일):
  # 공통
  OPENAI_API_KEY=sk-xxx

  # 네이버 블로그
  NAVER_ID=아이디
  NAVER_PW=비밀번호
  BLOG_ID=블로그아이디

  # 티스토리 블로그
  TISTORY_BLOG=블로그이름    (예: myblog → https://myblog.tistory.com)
  `);
}

// 실행
main().catch(console.error);
