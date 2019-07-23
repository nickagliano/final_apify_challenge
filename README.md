# apify-challenge

## how to use

### 1. <b> clone the repo </b>

```bash
git clone git@github.com:nickagliano/final_apify_challenge.git
```

### 2. <b>navigate to project and download npm dependencies</b>

```bash
npm install apify --save
npm install moment
npm install rimraf
```

### 3. <b>execute main.js</b>
 
```bash
node main.js
```

## code explained

There's 2 crawlers--
 
* The first crawler starts at https://www.visithoustontexas.com/events/, gets all the event links it can find, then goes to the next page it can find (/events?page=2), and repeats until it runs out of pages. Whenever it finds an event link, it adds it to the "eventQueue", a separate requestQueue.

* After the first crawler exhausts its queue, the second crawler starts to work through the eventQueue, which has just been populated with all of the event links. On each event page, the getEventData function is called. 

### functions

* getEventData()

* parseDate()

* dateRangeParser()

* momentify()
