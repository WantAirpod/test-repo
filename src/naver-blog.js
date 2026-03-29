import puppeteer from 'puppeteer-extra';
import StealthPlugin from 'puppeteer-extra-plugin-stealth';

// Stealth 플러그인 적용 - 자동화 감지 우회
puppeteer.use(StealthPlugin());

/**
 * Puppeteer 기반 네이버 블로그 자동 포스팅
 *
 * 수동 개입 필요 지점:
 * 1. 로그인 시 캡차/2차 인증
 * 2. 발행 시 2차 인증 (필요한 경우)
 */
export class NaverBlogClient {
  constructor(config) {
    this.naverId = config.naverId;
    this.naverPw = config.naverPw;
    this.blogId = config.blogId;
    this.browser = null;
    this.page = null;
  }

  async init() {
    console.log('🌐 브라우저 연결 중...');

    try {
      // 이미 실행 중인 Chrome에 연결 시도 (포트 9222)
      this.browser = await puppeteer.connect({
        browserURL: 'http://localhost:9222',
        defaultViewport: null,
      });
      console.log('   ✅ 기존 Chrome에 연결 성공!');

      // 새 탭 열기
      this.page = await this.browser.newPage();

    } catch (error) {
      // 연결 실패시 안내 메시지
      console.log('');
      console.log('❌ 실행 중인 Chrome을 찾을 수 없습니다.');
      console.log('');
      console.log('📋 Chrome을 디버깅 모드로 실행해주세요:');
      console.log('');
      console.log('   1. 모든 Chrome 창을 완전히 종료');
      console.log('   2. 터미널에서 아래 명령어 실행:');
      console.log('');
      console.log('   /Applications/Google\\ Chrome.app/Contents/MacOS/Google\\ Chrome --remote-debugging-port=9222');
      console.log('');
      console.log('   3. Chrome에서 네이버 로그인');
      console.log('   4. 다시 npm run post 실행');
      console.log('');
      throw new Error('Chrome 디버깅 모드 필요');
    }

    // 페이지 로드 타임아웃 설정
    this.page.setDefaultNavigationTimeout(60000);
    this.page.setDefaultTimeout(30000);
  }

  async login() {
    console.log('');
    console.log('========================================');
    console.log('🔐 [1단계] 로그인 확인');
    console.log('========================================');

    try {
      // 네이버 메인으로 이동하여 로그인 상태 확인
      console.log('📍 로그인 상태 확인...');
      await this.page.goto('https://www.naver.com', {
        waitUntil: 'networkidle2',
      });
      await this.sleep(2000);

      // 로그인 여부 확인 (로그인 버튼이 있으면 미로그인 상태)
      const isLoggedIn = await this.page.evaluate(() => {
        // 로그인 버튼이 없고, 로그아웃 버튼이나 사용자 메뉴가 있으면 로그인 상태
        const loginBtn = document.querySelector('.MyView-module__link_login___HpHMW') ||
                        document.querySelector('[class*="login"]') ||
                        document.querySelector('a[href*="nidlogin"]');
        const userMenu = document.querySelector('.MyView-module__link_name___') ||
                        document.querySelector('[class*="MyView"]') ||
                        document.querySelector('.gnb_my');

        // 로그인 버튼의 텍스트가 "로그인"이면 미로그인
        if (loginBtn && loginBtn.textContent.includes('로그인')) {
          return false;
        }

        return userMenu !== null;
      });

      if (isLoggedIn) {
        console.log('✅ 이미 로그인되어 있습니다!');
        return;
      }

      // 로그인 필요
      console.log('📍 로그인이 필요합니다. 로그인 페이지로 이동...');
      await this.page.goto('https://nid.naver.com/nidlogin.login', {
        waitUntil: 'networkidle2',
      });
      await this.sleep(2000);

      // 아이디/비밀번호 입력
      console.log('📝 로그인 정보 입력...');
      await this.page.evaluate((id, pw) => {
        const idInput = document.querySelector('#id');
        const pwInput = document.querySelector('#pw');
        if (idInput) idInput.value = id;
        if (pwInput) pwInput.value = pw;
      }, this.naverId, this.naverPw);

      await this.sleep(500);

      // 로그인 버튼 클릭
      await this.page.evaluate(() => {
        const loginBtn = document.querySelector('#log\\.login') ||
                        document.querySelector('.btn_login') ||
                        document.querySelector('button[type="submit"]');
        if (loginBtn) loginBtn.click();
      });

      console.log('⏳ 로그인 처리 중... (5초 대기)');
      await this.sleep(5000);

      // 로그인 성공 여부 확인
      const currentUrl = this.page.url();
      if (currentUrl.includes('nidlogin') || currentUrl.includes('captcha')) {
        console.log('');
        console.log('⚠️  ========================================');
        console.log('⚠️  캡차 또는 추가 인증이 필요합니다!');
        console.log('⚠️  브라우저에서 로그인을 완료해주세요.');
        console.log('⚠️  ========================================');
        console.log('⏳ 로그인 완료 대기 중... (최대 120초)');

        // 로그인 완료될 때까지 대기
        for (let i = 0; i < 24; i++) {
          await this.sleep(5000);
          const url = this.page.url();
          if (!url.includes('nidlogin') && !url.includes('captcha')) {
            console.log('✅ 로그인 감지됨!');
            break;
          }
          if (i % 4 === 0) {
            console.log(`   ... 대기 중 (${(i+1)*5}초/${120}초)`);
          }
        }
      }

      console.log('✅ 로그인 완료!');
      await this.sleep(2000);

    } catch (error) {
      console.log('⚠️  로그인 중 오류:', error.message);
      console.log('   브라우저에서 직접 로그인해주세요. (60초 대기)');
      await this.sleep(60000);
    }
  }

  async goToEditor() {
    console.log('');
    console.log('========================================');
    console.log('📝 [2단계] 글쓰기 페이지 이동');
    console.log('========================================');

    // 글쓰기 페이지로 이동
    console.log('📍 글쓰기 페이지로 이동...');
    await this.page.goto(`https://blog.naver.com/PostWriteForm.naver?blogId=${this.blogId}`, {
      waitUntil: 'networkidle2',
    });
    await this.sleep(3000);

    // 임시저장 글 팝업 처리
    await this.handleDraftPopup();

    // 에디터 페이지 확인
    const url = this.page.url();
    console.log(`📍 현재 URL: ${url}`);

    if (!url.includes('PostWrite') && !url.includes('postwrite')) {
      console.log('📍 에디터 페이지 재시도...');
      await this.page.goto(`https://blog.naver.com/PostWriteForm.naver?blogId=${this.blogId}`, {
        waitUntil: 'networkidle2',
      });
      await this.sleep(3000);
      await this.handleDraftPopup();
    }

    console.log('✅ 글쓰기 페이지 준비 완료!');
    console.log('⏳ 에디터 로딩 대기... (5초)');
    await this.sleep(5000);
  }

  async handleDraftPopup() {
    // "작성 중인 글이 있습니다" 팝업 처리
    console.log('🔍 임시저장 팝업 확인...');
    await this.sleep(2000);

    try {
      const result = await this.page.evaluate(() => {
        // 팝업 레이어 찾기
        const popupTexts = document.body.innerText;
        if (!popupTexts.includes('작성 중인 글') && !popupTexts.includes('임시저장')) {
          return 'no_popup';
        }

        // "새로 작성" 버튼 찾기
        const allClickables = document.querySelectorAll('button, a, span, div');
        for (const el of allClickables) {
          const text = el.textContent.trim();
          if (text === '새로 작성' || text === '새 글 작성') {
            el.click();
            return 'clicked_new';
          }
        }

        // "아니오" 또는 닫기 버튼
        for (const el of allClickables) {
          const text = el.textContent.trim();
          if (text === '아니오' || text === '아니요' || text === '취소') {
            el.click();
            return 'clicked_cancel';
          }
        }

        return 'popup_not_handled';
      });

      if (result === 'clicked_new' || result === 'clicked_cancel') {
        console.log('   ✓ 팝업 처리 완료');
        await this.sleep(2000);
      } else if (result === 'no_popup') {
        console.log('   ✓ 팝업 없음');
      }
    } catch (e) {
      console.log('   팝업 처리 중 오류 (무시)');
    }
  }

  async writePost(title, content) {
    console.log('');
    console.log('========================================');
    console.log('✍️  [3단계] 글 작성');
    console.log('========================================');

    // HTML 태그 제거
    const plainContent = content
      .replace(/<[^>]*>/g, '\n')
      .replace(/\n\n+/g, '\n\n')
      .trim();

    try {
      // 먼저 페이지 최상단 클릭하여 포커스 초기화
      console.log('📝 에디터 초기화...');
      await this.page.mouse.click(400, 200);
      await this.sleep(500);

      // 제목 영역 찾기 - 네이버 스마트에디터 구조
      console.log('📝 제목 영역 찾기...');

      const titleSelector = await this.page.evaluate(() => {
        // 네이버 스마트에디터 ONE 제목 영역
        const selectors = [
          '.se-documentTitle .se-text-paragraph',
          '.se-title .se-text-paragraph',
          '.se-documentTitle',
          '[class*="documentTitle"]',
          '[class*="title"] [contenteditable="true"]',
        ];

        for (const sel of selectors) {
          const el = document.querySelector(sel);
          if (el) {
            // 요소의 위치 반환
            const rect = el.getBoundingClientRect();
            return { selector: sel, x: rect.x + rect.width/2, y: rect.y + rect.height/2 };
          }
        }
        return null;
      });

      if (titleSelector) {
        console.log(`   제목 영역 발견: ${titleSelector.selector}`);
        // 제목 영역 직접 클릭
        await this.page.mouse.click(titleSelector.x, titleSelector.y);
        await this.sleep(500);
      } else {
        // 제목 영역을 못 찾으면 상단 클릭
        console.log('   제목 영역 직접 클릭 시도...');
        await this.page.mouse.click(500, 180);
        await this.sleep(500);
      }

      // 전체 선택 후 삭제 (기존 내용 제거)
      await this.page.keyboard.down('Control');
      await this.page.keyboard.press('a');
      await this.page.keyboard.up('Control');
      await this.page.keyboard.press('Backspace');
      await this.sleep(300);

      // 제목 입력
      console.log('📝 제목 입력...');
      await this.page.keyboard.type(title, { delay: 25 });
      console.log('   ✓ 제목 입력 완료');

      await this.sleep(1000);

      // 본문으로 이동 (Tab 또는 Enter)
      console.log('📝 본문 영역으로 이동...');
      await this.page.keyboard.press('Tab');
      await this.sleep(500);

      // 본문 영역 클릭 (제목 아래 영역)
      const bodySelector = await this.page.evaluate(() => {
        const selectors = [
          '.se-component.se-text .se-text-paragraph',
          '.se-content .se-text-paragraph',
          '.se-main-container .se-text-paragraph',
        ];

        for (const sel of selectors) {
          const els = document.querySelectorAll(sel);
          // 두 번째 paragraph가 보통 본문
          if (els.length > 1) {
            const rect = els[1].getBoundingClientRect();
            return { x: rect.x + rect.width/2, y: rect.y + rect.height/2 };
          }
        }
        return null;
      });

      if (bodySelector) {
        await this.page.mouse.click(bodySelector.x, bodySelector.y);
        await this.sleep(500);
      }

      // 본문 입력
      console.log('📝 본문 입력...');
      await this.page.keyboard.type(plainContent, { delay: 8 });
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
      // ========== 1차: 에디터의 "발행" 버튼 클릭 ==========
      console.log('📤 [1차] 에디터 발행 버튼 클릭...');

      await this.page.evaluate(() => {
        const buttons = document.querySelectorAll('button');
        for (const btn of buttons) {
          const text = btn.textContent.trim();
          if (text === '발행') {
            btn.click();
            return true;
          }
        }
        return false;
      });

      console.log('⏳ 발행 설정 팝업 대기... (3초)');
      await this.sleep(3000);

      // ========== 2차: 발행 확인 팝업에서 "발행" 버튼 클릭 ==========
      console.log('📤 [2차] 발행 확인 팝업 처리...');

      // 팝업/레이어/모달 내의 발행 버튼 찾기
      const secondClick = await this.page.evaluate(() => {
        // 팝업/모달 컨테이너 찾기
        const popupSelectors = [
          '.layer_popup',
          '.popup',
          '.modal',
          '[class*="popup"]',
          '[class*="modal"]',
          '[class*="layer"]',
          '[role="dialog"]',
        ];

        let popup = null;
        for (const sel of popupSelectors) {
          const el = document.querySelector(sel);
          if (el && el.offsetParent !== null) {
            popup = el;
            break;
          }
        }

        // 팝업 내에서 "발행" 버튼 찾기
        if (popup) {
          const popupButtons = popup.querySelectorAll('button');
          for (const btn of popupButtons) {
            const text = btn.textContent.trim();
            if (text === '발행' || text === '발행하기') {
              btn.click();
              return `팝업 내 ${text} 클릭`;
            }
          }
        }

        // 팝업을 못 찾으면 화면 전체에서 "발행" 버튼 찾기 (이미 클릭한 것 제외)
        const allButtons = Array.from(document.querySelectorAll('button'));
        const publishButtons = allButtons.filter(btn => {
          const text = btn.textContent.trim();
          return text === '발행' || text === '발행하기';
        });

        // 2개 이상의 "발행" 버튼이 있으면 두 번째 것 클릭 (팝업 내 버튼)
        if (publishButtons.length >= 2) {
          publishButtons[1].click();
          return '두 번째 발행 버튼 클릭';
        }

        // 1개만 있으면 다시 클릭
        if (publishButtons.length === 1) {
          publishButtons[0].click();
          return '발행 버튼 재클릭';
        }

        // "확인" 버튼 클릭 시도
        for (const btn of allButtons) {
          if (btn.textContent.trim() === '확인') {
            btn.click();
            return '확인 버튼 클릭';
          }
        }

        return null;
      });

      console.log(`   ✓ ${secondClick || '버튼 찾기 실패'}`);
      await this.sleep(3000);

      // ========== 3차: 추가 확인 팝업 대비 ==========
      console.log('📤 [3차] 추가 확인...');

      await this.page.evaluate(() => {
        const buttons = document.querySelectorAll('button');
        for (const btn of buttons) {
          const text = btn.textContent.trim();
          if (text === '발행' || text === '확인' || text === '발행하기') {
            btn.click();
            break;
          }
        }
      });

      await this.sleep(2000);

      console.log('');
      console.log('⚠️  ========================================');
      console.log('⚠️  발행 중입니다.');
      console.log('⚠️  2차 인증이 필요하면 브라우저에서 완료해주세요.');
      console.log('⚠️  ========================================');
      console.log('⏳ 발행 완료 대기 중... (최대 60초)');

      // 발행 완료 대기
      for (let i = 0; i < 12; i++) {
        await this.sleep(5000);
        const url = this.page.url();

        // 발행 완료 후 블로그 페이지로 이동하는지 확인
        if (!url.includes('PostWrite') && !url.includes('postwrite')) {
          console.log('');
          console.log('🎉 ========================================');
          console.log('🎉 발행 완료!');
          console.log(`🎉 블로그: https://blog.naver.com/${this.blogId}`);
          console.log('🎉 ========================================');
          return { success: true };
        }

        if (i % 2 === 0) {
          console.log(`   ... 대기 중 (${(i+1)*5}초)`);
        }
      }

      console.log('');
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
    // 기존 Chrome에 연결한 경우 브라우저를 닫지 않음
    // 탭만 닫기
    if (this.page) {
      await this.page.close();
    }
  }

  sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}
