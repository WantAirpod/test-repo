import puppeteer from 'puppeteer-extra';
import StealthPlugin from 'puppeteer-extra-plugin-stealth';

puppeteer.use(StealthPlugin());

/**
 * URL에서 이미지 추출
 */
export class ImageExtractor {
  constructor() {
    this.browser = null;
    this.page = null;
  }

  async init() {
    try {
      // 기존 Chrome에 연결
      this.browser = await puppeteer.connect({
        browserURL: 'http://localhost:9222',
        defaultViewport: null,
      });
      this.page = await this.browser.newPage();
    } catch (error) {
      throw new Error('Chrome 디버깅 모드 필요: npm run chrome');
    }
  }

  /**
   * URL에서 이미지 URL들 추출
   */
  async extractImages(url, maxImages = 5) {
    console.log(`🖼️  이미지 추출 중: ${url}`);

    try {
      await this.page.goto(url, {
        waitUntil: 'networkidle2',
        timeout: 30000,
      });
      await this.sleep(3000);

      // 페이지에서 이미지 URL 추출
      const images = await this.page.evaluate((max) => {
        const imgUrls = [];

        // 1. 일반 img 태그
        const imgs = document.querySelectorAll('img');
        imgs.forEach(img => {
          let src = img.src || img.dataset.src || img.dataset.lazySrc;
          if (src && src.startsWith('http') && !src.includes('icon') && !src.includes('logo')) {
            // 작은 이미지 제외 (width/height 체크)
            if (img.naturalWidth > 200 || img.width > 200 || !img.width) {
              imgUrls.push(src);
            }
          }
        });

        // 2. 배경 이미지
        const elements = document.querySelectorAll('[style*="background"]');
        elements.forEach(el => {
          const style = el.getAttribute('style') || '';
          const match = style.match(/url\(['"]?(https?:\/\/[^'")\s]+)['"]?\)/);
          if (match) {
            imgUrls.push(match[1]);
          }
        });

        // 3. 네이버 스마트스토어 특화 - 상품 이미지
        const productImgs = document.querySelectorAll(
          '._productImg, .product_img img, ._28-eTm img, [class*="ProductImage"] img'
        );
        productImgs.forEach(img => {
          const src = img.src || img.dataset.src;
          if (src && src.startsWith('http')) {
            imgUrls.push(src);
          }
        });

        // 중복 제거 및 최대 개수 제한
        const unique = [...new Set(imgUrls)];
        return unique.slice(0, max);
      }, maxImages);

      console.log(`   ✓ ${images.length}개 이미지 발견`);

      // 이미지 URL 정리 (썸네일 → 원본 크기로 변환)
      const cleanedImages = images.map(url => {
        // 네이버 이미지 URL 최적화
        if (url.includes('phinf.pstatic.net') || url.includes('shop-phinf.pstatic.net')) {
          // 썸네일 크기 제거하여 원본 이미지 사용
          return url.replace(/\?type=.*$/, '');
        }
        return url;
      });

      return cleanedImages;

    } catch (error) {
      console.log(`   ⚠️ 이미지 추출 실패: ${error.message}`);
      return [];
    }
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
 * URL에서 상품 정보 + 이미지 추출
 */
export async function extractProductInfo(url) {
  const extractor = new ImageExtractor();

  try {
    await extractor.init();

    // 페이지 이동
    await extractor.page.goto(url, {
      waitUntil: 'networkidle2',
      timeout: 30000,
    });
    await extractor.sleep(3000);

    // 상품 정보 추출
    const productInfo = await extractor.page.evaluate(() => {
      const getTextContent = (selectors) => {
        for (const sel of selectors) {
          const el = document.querySelector(sel);
          if (el) return el.textContent.trim();
        }
        return '';
      };

      return {
        title: getTextContent([
          '._3oDjSvLwEZ', // 스마트스토어 상품명
          '.product_title',
          'h2',
          'h1',
          '[class*="ProductName"]',
        ]),
        price: getTextContent([
          '._2DywKu0J_8', // 스마트스토어 가격
          '.product_price',
          '[class*="Price"]',
          '.price',
        ]),
        description: getTextContent([
          '.product_description',
          '[class*="Description"]',
          '.desc',
        ]),
      };
    });

    // 이미지 추출
    const images = await extractor.extractImages(url, 5);

    await extractor.close();

    return {
      ...productInfo,
      images,
      url,
    };

  } catch (error) {
    console.log(`상품 정보 추출 실패: ${error.message}`);
    await extractor.close();
    return { images: [], url };
  }
}
