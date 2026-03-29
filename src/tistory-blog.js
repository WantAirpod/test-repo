import puppeteer from 'puppeteer-extra';
import StealthPlugin from 'puppeteer-extra-plugin-stealth';
import { createWriteStream, existsSync, mkdirSync, unlinkSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';
import https from 'https';
import http from 'http';

puppeteer.use(StealthPlugin());

/**
 * 이미지 URL을 로컬 파일로 다운로드
 */
async function downloadImage(url, filepath) {
  return new Promise((resolve, reject) => {
    const protocol = url.startsWith('https') ? https : http;
    const file = createWriteStream(filepath);

    protocol.get(url, (response) => {
      // 리다이렉트 처리
      if (response.statusCode === 301 || response.statusCode === 302) {
        downloadImage(response.headers.location, filepath)
          .then(resolve)
          .catch(reject);
        return;
      }

      response.pipe(file);
      file.on('finish', () => {
        file.close();
        resolve(filepath);
      });
    }).on('error', (err) => {
      unlinkSync(filepath);
      reject(err);
    });
  });
}

/**
 * Puppeteer 기반 티스토리 블로그 자동 포스팅
 */
export class TistoryBlogClient {
  constructor(config) {
    this.blogName = config.blogName; // 블로그 주소 (예: myblog)
    this.browser = null;
    this.page = null;
    this.tempDir = join(tmpdir(), 'blog-images');

    // 임시 디렉토리 생성
    if (!existsSync(this.tempDir)) {
      mkdirSync(this.tempDir, { recursive: true });
    }
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
    await this.sleep(2000);

    // "작성 중인 글이 있습니다" 팝업 처리
    await this.handleDraftPopup();

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

  /**
   * 임시저장 글 팝업 처리
   */
  async handleDraftPopup() {
    try {
      // 팝업 감지 및 처리
      const popupHandled = await this.page.evaluate(() => {
        // 팝업 버튼들 찾기 (여러 가지 케이스)
        const buttons = document.querySelectorAll('button, .btn, [role="button"]');

        for (const btn of buttons) {
          const text = btn.textContent.trim();

          // "새로 작성" 또는 "삭제" 버튼 클릭 (기존 임시글 버리기)
          if (text.includes('새로 작성') ||
              text.includes('새글 작성') ||
              text.includes('삭제') ||
              text.includes('아니오') ||
              text.includes('취소하고 새로')) {
            btn.click();
            return '새로 작성';
          }
        }

        // 모달/다이얼로그 닫기 버튼
        const closeBtn = document.querySelector('.modal-close, .popup-close, [class*="close"], .btn-close');
        if (closeBtn) {
          closeBtn.click();
          return '닫기 버튼';
        }

        return null;
      });

      if (popupHandled) {
        console.log(`   ✓ 임시저장 팝업 처리: ${popupHandled}`);
        await this.sleep(1500);

        // 팝업 처리 후 다시 새글 페이지로 이동할 수 있음
        const currentUrl = this.page.url();
        if (!currentUrl.includes('newpost')) {
          await this.page.goto(`https://${this.blogName}.tistory.com/manage/newpost`, {
            waitUntil: 'networkidle2',
          });
          await this.sleep(2000);
        }
      }
    } catch (e) {
      // 팝업이 없으면 무시
    }
  }

  async writePost(title, content, images = []) {
    console.log('');
    console.log('========================================');
    console.log('✍️  [3단계] 글 작성');
    console.log('========================================');

    let htmlContent = content;

    // 이미지가 있으면 먼저 업로드
    if (images && images.length > 0) {
      console.log(`🖼️  ${images.length}개 이미지 업로드 시작...`);
      await this.uploadImages(images);
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

      // HTML을 일반 텍스트로 변환 (줄바꿈 유지)
      let plainContent = htmlContent
        .replace(/<br\s*\/?>/gi, '\n')
        .replace(/<\/p>/gi, '\n\n')
        .replace(/<\/div>/gi, '\n')
        .replace(/<\/h[1-6]>/gi, '\n\n')
        .replace(/<h[1-6][^>]*>/gi, '## ')  // 소제목을 마크다운으로
        .replace(/<li>/gi, '• ')
        .replace(/<\/li>/gi, '\n')
        .replace(/<strong>/gi, '**')
        .replace(/<\/strong>/gi, '**')
        .replace(/<b>/gi, '**')
        .replace(/<\/b>/gi, '**')
        .replace(/<[^>]*>/g, '')
        .replace(/&nbsp;/g, ' ')
        .replace(/&amp;/g, '&')
        .replace(/&lt;/g, '<')
        .replace(/&gt;/g, '>')
        .replace(/\n{3,}/g, '\n\n')
        .trim();

      // 이미지 업로드 실패 시 URL을 본문 끝에 추가
      if (this.fallbackImageUrls && this.fallbackImageUrls.length > 0) {
        const imageSection = '\n\n---\n\n📷 **이미지 URL (수동 삽입 필요)**\n\n' +
          this.fallbackImageUrls.map((url, i) => `${i + 1}. ${url}`).join('\n');
        plainContent += imageSection;
        console.log(`   📷 ${this.fallbackImageUrls.length}개 이미지 URL 본문에 추가`);
      }

      // 본문 영역으로 Tab 이동
      console.log('   📝 본문 영역으로 이동...');
      await this.page.keyboard.press('Tab');
      await this.sleep(500);

      // 에디터 영역 클릭 시도
      const clicked = await this.page.evaluate(() => {
        // 티스토리 에디터 본문 영역 찾기
        const selectors = [
          '.CodeMirror-scroll',
          '.CodeMirror-code',
          '.CodeMirror',
          '#editor-content',
          '.editor',
          '[data-placeholder]',
          '.mce-content-body',
          'textarea',
        ];

        for (const sel of selectors) {
          const el = document.querySelector(sel);
          if (el) {
            el.click();
            el.focus();
            return sel;
          }
        }
        return null;
      });

      console.log(`   📝 에디터 감지: ${clicked || '없음, 키보드 입력 시도'}`);
      await this.sleep(500);

      // 클립보드를 통한 붙여넣기 시도
      try {
        await this.page.evaluate(async (text) => {
          await navigator.clipboard.writeText(text);
        }, plainContent);

        // Cmd+V (Mac) 또는 Ctrl+V (Windows)
        await this.page.keyboard.down('Meta');
        await this.page.keyboard.press('v');
        await this.page.keyboard.up('Meta');

        console.log('   📝 클립보드 붙여넣기 시도');
        await this.sleep(1000);
      } catch (e) {
        console.log('   ⚠️ 클립보드 실패, 직접 타이핑...');
      }

      // 내용이 입력되었는지 확인
      const hasContent = await this.page.evaluate(() => {
        const cm = document.querySelector('.CodeMirror');
        if (cm && cm.CodeMirror) {
          return cm.CodeMirror.getValue().length > 10;
        }
        const editor = document.querySelector('[contenteditable="true"]');
        if (editor) {
          return editor.innerText.length > 10;
        }
        return false;
      });

      // 입력 안됐으면 직접 타이핑
      if (!hasContent) {
        console.log('   📝 직접 타이핑 모드...');

        // 줄 단위로 입력
        const lines = plainContent.split('\n');
        for (let i = 0; i < lines.length; i++) {
          const line = lines[i];
          if (line.trim()) {
            await this.page.keyboard.type(line, { delay: 3 });
          }
          if (i < lines.length - 1) {
            await this.page.keyboard.press('Enter');
          }

          // 매 10줄마다 상태 출력
          if (i > 0 && i % 10 === 0) {
            console.log(`   ... ${i}/${lines.length} 줄 입력 중`);
          }
        }
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

  /**
   * 이미지 다운로드 및 업로드
   */
  async uploadImages(imageUrls) {
    const uploadedCount = { success: 0, failed: 0 };

    // 먼저 모든 이미지 다운로드
    const downloadedFiles = [];
    for (let i = 0; i < imageUrls.length; i++) {
      const url = imageUrls[i];
      try {
        const ext = url.match(/\.(jpg|jpeg|png|gif|webp)/i)?.[1] || 'jpg';
        const filename = `img_${Date.now()}_${i}.${ext}`;
        const filepath = join(this.tempDir, filename);
        await downloadImage(url, filepath);
        downloadedFiles.push(filepath);
      } catch (e) {
        console.log(`   ⚠️ 이미지 ${i + 1} 다운로드 실패`);
      }
    }

    if (downloadedFiles.length === 0) {
      console.log('   ⚠️ 다운로드된 이미지가 없습니다.');
      return;
    }

    console.log(`   📥 ${downloadedFiles.length}개 이미지 다운로드 완료`);

    try {
      // 티스토리 에디터에서 이미지 버튼 찾기 및 클릭
      console.log('   📷 이미지 업로드 버튼 찾는 중...');

      // 방법 1: 툴바의 이미지 버튼 클릭
      const imageButtonClicked = await this.page.evaluate(() => {
        // 티스토리 에디터 툴바에서 이미지 버튼 찾기
        const selectors = [
          'button[data-name="image"]',
          'button[class*="image"]',
          'button[title*="이미지"]',
          'button[title*="사진"]',
          '.btn-image',
          '.tool-image',
          '[class*="ImageButton"]',
          'button svg[class*="image"]',
        ];

        for (const sel of selectors) {
          const btn = document.querySelector(sel);
          if (btn) {
            btn.click();
            return sel;
          }
        }

        // 아이콘으로 찾기
        const buttons = document.querySelectorAll('button');
        for (const btn of buttons) {
          const svg = btn.querySelector('svg');
          const img = btn.querySelector('img');
          const title = btn.getAttribute('title') || '';
          const ariaLabel = btn.getAttribute('aria-label') || '';

          if (title.includes('이미지') || title.includes('사진') ||
              ariaLabel.includes('이미지') || ariaLabel.includes('사진')) {
            btn.click();
            return 'title/aria 매칭';
          }
        }

        return null;
      });

      if (imageButtonClicked) {
        console.log(`   ✓ 이미지 버튼 클릭: ${imageButtonClicked}`);
        await this.sleep(1500);
      }

      // 파일 input 찾기 (숨겨진 것도 포함)
      // Puppeteer는 숨겨진 input도 uploadFile 가능
      const fileInputs = await this.page.$$('input[type="file"]');

      if (fileInputs.length > 0) {
        // 마지막 file input 사용 (보통 새로 생성된 것)
        const fileInput = fileInputs[fileInputs.length - 1];

        // 모든 파일 한번에 업로드
        await fileInput.uploadFile(...downloadedFiles);
        console.log(`   📤 ${downloadedFiles.length}개 파일 업로드 중...`);

        await this.sleep(3000); // 업로드 완료 대기

        uploadedCount.success = downloadedFiles.length;
        console.log(`   ✓ 이미지 업로드 완료!`);

      } else {
        console.log('   ⚠️ 파일 input을 찾을 수 없습니다.');
        console.log('   → 이미지 URL을 본문에 포함합니다.');

        // 대안: 이미지 URL을 마크다운으로 본문에 추가
        this.fallbackImageUrls = imageUrls;
        uploadedCount.failed = downloadedFiles.length;
      }

    } catch (error) {
      console.log(`   ⚠️ 업로드 오류: ${error.message}`);
      uploadedCount.failed = downloadedFiles.length;
    }

    // 임시 파일 정리
    for (const filepath of downloadedFiles) {
      try {
        unlinkSync(filepath);
      } catch (e) {}
    }

    // 모달/팝업 닫기
    await this.page.keyboard.press('Escape');
    await this.sleep(500);
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
