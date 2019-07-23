const Apify = require('apify');
const util = require('util');
const puppeteer = require('puppeteer');


Apify.main(async () => {

    const browser = await puppeteer.launch();
    const page = await browser.newPage();
    await page.goto('https://www.visithoustontexas.com/events/');
    const requestQueue = await Apify.openRequestQueue();
    requestQueue.addRequest({ url: 'https://www.visithoustontexas.com/events/?page=1'});

//*****************************************************************************
// Create linkCrawler
const linkCrawler = new Apify.PuppeteerCrawler({
    requestQueue,
    handlePageFunction:  async ({ request, page }) => {
    try {
      await page.waitFor('a.arrow.next');
      await Apify.utils.enqueueLinks({
        page,
        selector: 'a.arrow.next',
        // pseudoUrls: [
        //     'http[s?]://www.visithoustontexas.com/events/?page=[\\d+]',
        // ],
        requestQueue });
    } catch {
      console.log("failed to add links to queue");
    }

    try {
      await page.waitFor('div.item-int > div.info > div.title a');
      const links = await page.$$eval('div.item-int > div.info > div.title a', anchors => { return anchors.map(anchor => anchor.href)});
      var n = request.url.indexOf("?page=");
      var key = request.url.substr(n+6);
      const store = await Apify.openKeyValueStore('event-links');
      await store.setValue(key, {links});
    } catch {
      console.log("failed to find event links");
    }
    },
    maxRequestsPerCrawl: 100
}); // end linkCrawler

  // Run link crawler.
  try {
    await linkCrawler.run();
  } catch {
      console.log("error was encountered");
  }
//******************************************************************************
}); //end Apify.main()
