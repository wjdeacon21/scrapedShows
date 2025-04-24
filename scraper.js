const puppeteer = require('puppeteer');
const axios = require('axios');
const cheerio = require('cheerio');

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

  const shows = await page.$$eval('.row.vevent', rows =>
    rows.map(row => {
      
      //Get all artist names
      const artistEl = Array.from(row.querySelectorAll('.bands.summary a')).filter(a =>
        a.classList.contains('non-profiled') || a.className.trim() === ''
      );
      const artistNames = artistEl.map(a => a.textContent.trim());

      //Get show date
      const datetimeAttr = row.querySelector('.value-title')?.getAttribute('title') || '';

      let date = 'Unknown';
      let time = 'Unknown';
  
      if (datetimeAttr) {
        const dt = new Date(datetimeAttr);
        date = dt.toLocaleDateString(); // e.g. "5/17/2025"
        time = dt.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }); // "7:00 PM"
      }

      //Get venue
      const venue = row.querySelector('.fn.org').textContent.trim();

      return { artists: artistNames, date, time, venue };
    })
    
  );

  console.log('🎤 Shows found:', shows);

  await browser.close();
  return shows;
}

// Run directly
if (require.main === module) {
  getArtistNames().catch(error => {
    console.error('❌ Error in Puppeteer scraper:', error.message);
  });
}

module.exports = getArtistNames;