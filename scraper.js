const puppeteer = require('puppeteer')
const axios = require('axios');
const cheerio = require('cheerio');
const fs = require('fs');
const path = require('path');

// Helper function to save data to JSON file
async function saveToJson(data) {
  const dataDir = path.join(__dirname, 'data');
  
  // Create data directory if it doesn't exist
  if (!fs.existsSync(dataDir)) {
    fs.mkdirSync(dataDir);
  }

  // Create filename with timestamp
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const filename = path.join(dataDir, `shows_${timestamp}.json`);

  try {
    await fs.promises.writeFile(filename, JSON.stringify(data, null, 2));
    console.log(`✅ Data saved to ${filename}`);
  } catch (error) {
    console.error('❌ Error saving data:', error.message);
  }
}

async function getArtistNames() {
  const browser = await puppeteer.launch({
    headless: true,
    args: ['--ignore-certificate-errors','--disable-setuid-sandbox','--ignore-certificate-errors']  // 👈 ignores SSL cert issues
  });

  const page = await browser.newPage();
  const shows = [];

  for (let pageNum = 1; pageNum <= 5; pageNum++) {
    const url = `https://www.ohmyrockness.com/shows/just-announced?page=${pageNum}`;
    console.log(`Scraping page ${pageNum}...`);
    
    await page.goto(url, {
      waitUntil: 'networkidle2',
      timeout: 0
    });

    const pageShows = await page.$$eval('.row.vevent', rows =>
      rows.map(row => {
        const artistEl = Array.from(row.querySelectorAll('.bands.summary a')).filter(a =>
          a.classList.contains('non-profiled') || a.className.trim() === ''
        );
        const artistNames = artistEl.map(a => a.textContent.trim());

        const datetimeAttr = row.querySelector('.value-title')?.getAttribute('title') || '';

        let date = 'Unknown';
        let time = 'Unknown';
    
        if (datetimeAttr) {
          const dt = new Date(datetimeAttr);
          date = dt.toLocaleDateString();
          time = dt.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
        }

        const venue = row.querySelector('.fn.org').textContent.trim();

        return { name: { artists: artistNames, date, time, venue } };
      })
    );

    shows.push(...pageShows);
  }

  console.log('🎤 Total shows found:', shows.length);

  await browser.close();
  
  // Save the data to a JSON file
  await saveToJson(shows);
  
  return shows;
}

// Run directly
if (require.main === module) {
  getArtistNames().catch(error => {
    console.error('❌ Error in Puppeteer scraper:', error.message);
  });
}

module.exports = getArtistNames;