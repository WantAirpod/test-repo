import puppeteer from 'puppeteer-extra';
import StealthPlugin from 'puppeteer-extra-plugin-stealth';

puppeteer.use(StealthPlugin());

/**
 * Puppeteer 기반 티스토리 블로그 자동 포스팅
 */
export class TistoryBlogClient {
  constructor(config) {
    this.blogName = config.blogName; // 블로그 주소 (예: myblog)
    this.browser = null;
    this.page = null;
  }

  async init() {
    console.log('🌐 브라우저 연결 중...');

    try {
      // 이미 실행 중인 Chrome에 연결 (포트 9222)
      this.browser = await puppeteer.connect({
        browserURL: 'http://localhost:9222',
        defaultViewport: null,
      });
      console.log('   ✅ 기존 Chrome에 연결 성공!');

      this.page = await this.browser.newPage();

    } catch (error) {
      console.log('');
      console.log('❌ 실행 중인 Chrome을 찾을 수 없습니다.');
      console.log('');
      console.log('📋 먼저 Chrome을 디버깅 모드로 실행해주세요:');
      console.log('   npm run chrome');
      console.log('');
      console.log('   그 다음 티스토리에 로그인하세요.');
      console.log('');
      throw new Error('Chrome 디버깅 모드 필요');
    }

    this.page.setDefaultNavigationTimeout(60000);
    this.page.setDefaultTimeout(30000);
  }

  async login() {
    console.log('');
    console.log('========================================');
    console.log('🔐 [1단계] 로그인 확인');
    console.log('========================================');

    try {
      // 티스토리 메인으로 이동하여 로그인 상태 확인
      console.log('📍 티스토리 로그인 상태 확인...');
      await this.page.goto('https://www.tistory.com', {
        waitUntil: 'networkidle2',
      });
      await this.sleep(2000);

      // 로그인 여부 확인
      const isLoggedIn = await this.page.evaluate(() => {
        // 로그인 버튼이 있으면 미로그인
        const loginBtn = document.querySelector('a[href*="login"]');
        const userMenu = document.querySelector('.ico_user') ||
                        document.querySelector('[class*="profile"]') ||
                        document.querySelector('.btn_mynew');

        if (loginBtn && loginBtn.textContent.includes('로그인')) {
          return false;
        }
        return userMenu !== null;
      });

      if (isLoggedIn) {
        console.log('✅ 이미 로그인되어 있습니다!');
        return;
      }

      console.log('');
      console.log('⚠️  ========================================');
      console.log('⚠️  티스토리 로그인이 필요합니다!');
      console.log('⚠️  브라우저에서 로그인해주세요.');
      console.log('⚠️  ========================================');
      console.log('⏳ 로그인 완료 대기 중... (최대 120초)');

      // 로그인 완료될 때까지 대기
      for (let i = 0; i < 24; i++) {
        await this.sleep(5000);

        const loggedIn = await this.page.evaluate(() => {
          return document.querySelector('.ico_user') !== null ||
                 document.querySelector('[class*="profile"]') !== null;
        });

        if (loggedIn) {
          console.log('✅ 로그인 감지됨!');
          break;
        }

        if (i % 4 === 0) {
          console.log(`   ... 대기 중 (${(i+1)*5}초/${120}초)`);
        }
      }

      console.log('✅ 로그인 완료!');
      await this.sleep(2000);

    } catch (error) {
      console.log('⚠️  로그인 확인 중 오류:', error.message);
    }
  }

  async goToEditor() {
    console.log('');
    console.log('========================================');
    console.log('📝 [2단계] 글쓰기 페이지 이동');
    console.log('========================================');

    // 글쓰기 페이지로 이동
    const writeUrl = `https://${this.blogName}.tistory.com/manage/newpost`;
    console.log(`📍 글쓰기 페이지로 이동: ${writeUrl}`);

    await this.page.goto(writeUrl, {
      waitUntil: 'networkidle2',
    });
    await this.sleep(3000);

    // 에디터 로딩 확인
    const url = this.page.url();
    console.log(`📍 현재 URL: ${url}`);

    if (url.includes('newpost') || url.includes('write')) {
      console.log('✅ 글쓰기 페이지 준비 완료!');
    } else {
      console.log('⚠️  글쓰기 페이지가 아닙니다. 확인해주세요.');
    }

    console.log('⏳ 에디터 로딩 대기... (3초)');
    await this.sleep(3000);
  }

  async writePost(title, content, images = []) {
    console.log('');
    console.log('========================================');
    console.log('✍️  [3단계] 글 작성');
    console.log('========================================');

    // 이미지가 있으면 HTML에 추가
    let htmlContent = content;
    if (images && images.length > 0) {
      console.log(`🖼️  ${images.length}개 이미지 포함`);
      const imageHtml = images.map(url =>
        `<p><img src="${url}" style="max-width:100%;" /></p>`
      ).join('\n');
      htmlContent = imageHtml + '\n\n' + content;
    }

    try {
      // 제목 입력
      console.log('📝 제목 입력...');

      // 제목 입력란 찾기
      const titleInput = await this.page.$('#post-title-inp') ||
                        await this.page.$('input[name="title"]') ||
                        await this.page.$('.tit_post input');

      if (titleInput) {
        await titleInput.click();
        await this.sleep(300);
        await titleInput.type(title, { delay: 20 });
        console.log('   ✓ 제목 입력 완료');
      } else {
        // contenteditable 방식
        await this.page.evaluate(() => {
          const titleEl = document.querySelector('[class*="title"] [contenteditable]') ||
                         document.querySelector('.tit_post');
          if (titleEl) {
            titleEl.click();
            titleEl.focus();
          }
        });
        await this.sleep(300);
        await this.page.keyboard.type(title, { delay: 20 });
        console.log('   ✓ 제목 입력 완료');
      }

      await this.sleep(1000);

      // 본문 입력
      console.log('📝 본문 입력...');

      // 본문 영역 클릭
      await this.page.evaluate(() => {
        // 티스토리 에디터 본문 영역
        const bodyEl = document.querySelector('#tinymce') ||
                      document.querySelector('.contents_editor') ||
                      document.querySelector('[contenteditable="true"]') ||
                      document.querySelector('iframe');
        if (bodyEl) {
          bodyEl.click();
          bodyEl.focus();
        }
      });

      await this.sleep(500);

      // iframe 에디터인 경우 처리
      const frames = this.page.frames();
      let editorFrame = frames.find(f => f.url().includes('editor') || f.name().includes('editor'));

      if (editorFrame) {
        await editorFrame.evaluate((html) => {
          const body = document.body || document.querySelector('[contenteditable]');
          if (body) {
            body.innerHTML = html;
          }
        }, htmlContent);
      } else {
        // 일반 에디터
        await this.page.keyboard.type(content.replace(/<[^>]*>/g, '\n').trim(), { delay: 8 });
      }

      console.log('   ✓ 본문 입력 완료');

      await this.sleep(2000);
      console.log('✅ 글 작성 완료!');

      return { success: true };
    } catch (error) {
      console.error('❌ 글 작성 중 오류:', error.message);
      return { success: false };
    }
  }

  async publish() {
    console.log('');
    console.log('========================================');
    console.log('📤 [4단계] 발행');
    console.log('========================================');

    try {
      // 발행/완료 버튼 클릭
      console.log('📤 발행 버튼 클릭...');

      const publishClicked = await this.page.evaluate(() => {
        // 티스토리 발행 버튼 (여러 셀렉터 시도)
        const selectors = [
          '#publish-layer-btn',
          '.btn_publish',
          'button[class*="publish"]',
          '.btn_save',
          '#save-btn',
        ];

        for (const sel of selectors) {
          const btn = document.querySelector(sel);
          if (btn) {
            btn.click();
            return sel;
          }
        }

        // 텍스트로 찾기
        const buttons = document.querySelectorAll('button');
        for (const btn of buttons) {
          const text = btn.textContent.trim();
          if (text === '발행' || text === '완료' || text === '저장') {
            btn.click();
            return text;
          }
        }

        return null;
      });

      console.log(`   발행 버튼: ${publishClicked || '찾기 실패'}`);
      await this.sleep(2000);

      // 발행 확인 팝업 처리
      console.log('📤 발행 확인...');

      await this.page.evaluate(() => {
        const buttons = document.querySelectorAll('button');
        for (const btn of buttons) {
          const text = btn.textContent.trim();
          if (text === '발행' || text === '확인' || text === '공개 발행') {
            btn.click();
            return;
          }
        }
      });

      await this.sleep(3000);

      // 발행 완료 확인
      const currentUrl = this.page.url();
      if (!currentUrl.includes('newpost') && !currentUrl.includes('write')) {
        console.log('');
        console.log('🎉 ========================================');
        console.log('🎉 발행 완료!');
        console.log(`🎉 블로그: https://${this.blogName}.tistory.com`);
        console.log('🎉 ========================================');
        return { success: true };
      }

      console.log('⚠️  발행 완료를 확인하지 못했습니다.');
      console.log('   브라우저에서 직접 확인해주세요.');
      return { success: false };

    } catch (error) {
      console.error('❌ 발행 중 오류:', error.message);
      return { success: false };
    }
  }

  async close() {
    console.log('');
    console.log('🔚 작업 완료! (브라우저는 유지됩니다)');
    if (this.page) {
      await this.page.close();
    }
  }

  sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}
