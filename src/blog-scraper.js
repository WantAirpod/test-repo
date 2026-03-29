import puppeteer from 'puppeteer-extra';
import StealthPlugin from 'puppeteer-extra-plugin-stealth';

puppeteer.use(StealthPlugin());

/**
 * 블로그 검색 및 이미지/내용 추출
 */
export class BlogScraper {
  constructor() {
    this.browser = null;
    this.page = null;
  }

  async init() {
    try {
      this.browser = await puppeteer.connect({
        browserURL: 'http://localhost:9222',
        defaultViewport: null,
      });
      this.page = await this.browser.newPage();
      console.log('🔍 블로그 스크래퍼 초기화 완료');
    } catch (error) {
      throw new Error('Chrome 디버깅 모드 필요: npm run chrome');
    }
  }

  /**
   * 주제로 블로그 검색 후 이미지 및 참고 내용 추출
   */
  async searchAndExtract(topic, maxBlogs = 3, maxImages = 5) {
    console.log(`🔍 "${topic}" 관련 블로그 검색 중...`);

    const results = {
      images: [],
      references: [],
    };

    try {
      // 네이버 블로그 검색
      const searchUrl = `https://search.naver.com/search.naver?where=blog&query=${encodeURIComponent(topic)}`;
      await this.page.goto(searchUrl, { waitUntil: 'networkidle2' });
      await this.sleep(2000);

      // 블로그 링크 추출
      const blogLinks = await this.page.evaluate((max) => {
        const links = [];

        // 여러 셀렉터 시도
        const selectors = [
          '.api_txt_lines.total_tit',
          'a.title_link',
          '.title_area a',
          'a[href*="blog.naver.com"]',
          '.list_info a',
          '.detail_box a.title',
        ];

        for (const selector of selectors) {
          const items = document.querySelectorAll(selector);
          items.forEach(item => {
            const href = item.getAttribute('href');
            if (href && (href.includes('blog.naver.com') || href.includes('post.naver.com'))) {
              if (!links.includes(href) && links.length < max) {
                links.push(href);
              }
            }
          });

          if (links.length >= max) break;
        }

        return links;
      }, maxBlogs);

      console.log(`   ✓ ${blogLinks.length}개 블로그 발견`);

      // 각 블로그 방문하여 이미지 및 내용 추출
      for (let i = 0; i < blogLinks.length; i++) {
        const blogUrl = blogLinks[i];
        console.log(`   📖 블로그 ${i + 1}/${blogLinks.length} 분석 중...`);

        try {
          const blogData = await this.extractFromBlog(blogUrl);

          // 이미지 추가 (중복 제거)
          for (const img of blogData.images) {
            if (!results.images.includes(img) && results.images.length < maxImages) {
              results.images.push(img);
            }
          }

          // 참고 내용 추가
          if (blogData.summary) {
            results.references.push({
              url: blogUrl,
              summary: blogData.summary,
            });
          }
        } catch (e) {
          console.log(`   ⚠️ 블로그 ${i + 1} 추출 실패: ${e.message}`);
        }
      }

      console.log(`   ✓ 총 ${results.images.length}개 이미지 추출 완료`);

    } catch (error) {
      console.log(`⚠️ 검색 중 오류: ${error.message}`);
    }

    return results;
  }

  /**
   * 개별 블로그에서 이미지와 요약 추출
   */
  async extractFromBlog(url) {
    const result = {
      images: [],
      summary: '',
    };

    try {
      await this.page.goto(url, { waitUntil: 'networkidle2', timeout: 15000 });
      await this.sleep(2000);

      // 네이버 블로그 iframe 처리
      const frames = this.page.frames();
      let contentFrame = frames.find(f =>
        f.url().includes('blog.naver.com') && f.url().includes('PostView')
      ) || this.page;

      // 이미지 추출
      const images = await contentFrame.evaluate(() => {
        const imgs = [];
        const imgElements = document.querySelectorAll(
          '.se-image-resource, .se_mediaImage img, img[id^="img_"]'
        );

        imgElements.forEach(img => {
          let src = img.src || img.dataset.src || img.dataset.lazySrc;
          if (src && src.startsWith('http')) {
            // 썸네일이 아닌 원본 이미지
            if (!src.includes('thumb') || src.includes('w800') || src.includes('w1200')) {
              // 네이버 이미지 URL 정리
              src = src.split('?')[0];
              if (!imgs.includes(src)) {
                imgs.push(src);
              }
            }
          }
        });

        return imgs.slice(0, 5);
      });

      result.images = images;

      // 본문 전체 추출 (참고용) - 더 많은 내용 수집
      const summary = await contentFrame.evaluate(() => {
        const textElements = document.querySelectorAll(
          '.se-text-paragraph, .se_textarea, .post-view p, .se-component-content'
        );

        let text = '';
        textElements.forEach(el => {
          const innerText = el.innerText.trim();
          if (innerText.length > 10) { // 의미있는 텍스트만
            text += innerText + '\n\n';
          }
        });

        // 1500자까지 추출 (더 많은 컨텍스트)
        return text.trim().slice(0, 1500);
      });

      result.summary = summary;

    } catch (e) {
      // 추출 실패 시 무시
    }

    return result;
  }

  async close() {
    if (this.page) {
      await this.page.close();
    }
  }

  sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}

/**
 * 간편 함수: 주제로 이미지 검색
 */
export async function searchBlogImages(topic, maxImages = 5) {
  const scraper = new BlogScraper();

  try {
    await scraper.init();
    const results = await scraper.searchAndExtract(topic, 3, maxImages);
    await scraper.close();
    return results;
  } catch (error) {
    console.log(`이미지 검색 실패: ${error.message}`);
    return { images: [], references: [] };
  }
}
