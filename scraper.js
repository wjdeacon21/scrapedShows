const puppeteer = require('puppeteer');

async function getArtistNames() {
  const browser = await puppeteer.launch({
    headless: true,
    args: ['--ignore-certificate-errors']  // 👈 ignores SSL cert issues
  });

  const page = await browser.newPage();

  await page.goto('https://www.ohmyrockness.com/shows/just-announced', {
    waitUntil: 'networkidle2',
    timeout: 0
  });

  const artists = await page.$$eval('.non-profiled', links =>
    links.map(link => link.textContent.trim())
  );

  console.log('🎤 Artists found:', artists);

  await browser.close();
  return artists;
}

// Run directly
if (require.main === module) {
  getArtistNames().catch(error => {
    console.error('❌ Error in Puppeteer scraper:', error.message);
  });
}

module.exports = getArtistNames;