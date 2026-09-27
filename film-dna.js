/*
 MovieMind — Film DNA
 Local Letterboxd ZIP analyzer.
*/

(function(){

"use strict";

if(typeof JSZip === "undefined"){
  console.error("Film DNA requires JSZip.");
  return;
}

const upload = document.getElementById("letterboxdUpload");
if(!upload) return;

const dropzone = document.getElementById("filmDnaDropzone");
const status = document.getElementById("filmDnaStatus");
const dashboard = document.getElementById("filmDnaDashboard");
const empty = document.getElementById("filmDnaEmpty");
const reset = document.getElementById("filmDnaReset");

upload.addEventListener("change", e => {
  const file = e.target.files?.[0];
  if(file) analyzeFile(file);
});

if(dropzone){
  ["dragenter","dragover"].forEach(name => {
    dropzone.addEventListener(name, e => {
      e.preventDefault();
      dropzone.classList.add("dragging");
    });
  });

  ["dragleave","drop"].forEach(name => {
    dropzone.addEventListener(name, e => {
      e.preventDefault();
      dropzone.classList.remove("dragging");
    });
  });

  dropzone.addEventListener("drop", e => {
    const file = e.dataTransfer?.files?.[0];
    if(file && file.name.toLowerCase().endsWith(".zip")){
      analyzeFile(file);
    }else{
      setStatus("Please choose a Letterboxd ZIP export.", true);
    }
  });
}

if(reset){
  reset.addEventListener("click", resetAnalysis);
}

async function analyzeFile(file){

  try{

    setStatus("Reading your Letterboxd universe...");

    const zip = await JSZip.loadAsync(file);

    const csvEntries = Object.values(zip.files).filter(
      entry =>
        !entry.dir &&
        entry.name.toLowerCase().endsWith(".csv")
    );

    if(!csvEntries.length){
      throw new Error("No CSV files were found inside this export.");
    }

    setStatus(`Reading ${csvEntries.length} Letterboxd data files...`);

    const files = {};

    for(const entry of csvEntries){
      const name = entry.name
        .split("/")
        .pop()
        .replace(/\.csv$/i,"")
        .toLowerCase();

      files[name] = parseCSV(await entry.async("text"));
    }

    const data = buildAnalysis(files);

    renderAnalysis(data);

    setStatus(
      `Analysis complete · ${data.rated.length.toLocaleString()} rated films found.`
    );

  }catch(error){

    console.error(error);
    setStatus(
      error.message || "MovieMind could not read this export.",
      true
    );

  }

}

function parseCSV(text){

  const rows = [];
  let row = [];
  let cell = "";
  let quoted = false;

  for(let i=0;i<text.length;i++){

    const char = text[i];
    const next = text[i+1];

    if(char === '"'){

      if(quoted && next === '"'){
        cell += '"';
        i++;
      }else{
        quoted = !quoted;
      }

      continue;
    }

    if(char === "," && !quoted){
      row.push(cell);
      cell = "";
      continue;
    }

    if((char === "\n" || char === "\r") && !quoted){

      if(char === "\r" && next === "\n") i++;

      row.push(cell);
      cell = "";

      if(row.some(v => String(v).trim() !== "")){
        rows.push(row);
      }

      row = [];
      continue;
    }

    cell += char;
  }

  if(cell !== "" || row.length){
    row.push(cell);
    if(row.some(v => String(v).trim() !== "")) rows.push(row);
  }

  if(!rows.length) return [];

  const headers = rows[0].map(normalizeHeader);

  return rows.slice(1).map(values => {

    const object = {};

    headers.forEach((header,index) => {
      object[header] = String(values[index] ?? "").trim();
    });

    return object;

  }).filter(row =>
    Object.values(row).some(value => value !== "")
  );
}

function normalizeHeader(value){

  return String(value ?? "")
    .trim()
    .replace(/^\uFEFF/,"")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g,"_")
    .replace(/^_|_$/g,"");

}

function findFile(files,names){

  for(const name of names){
    if(Array.isArray(files[name])) return files[name];
  }

  return [];
}

function firstValue(row,keys){

  for(const key of keys){
    if(row && row[key] !== undefined && row[key] !== ""){
      return row[key];
    }
  }

  return "";
}

function parseYear(value){

  const match = String(value ?? "").match(/\b(18|19|20)\d{2}\b/);
  return match ? Number(match[0]) : null;

}

function parseRating(value){

  if(value === null || value === undefined || value === "") return null;

  const number = Number(String(value).replace(",","."));

  if(!Number.isFinite(number)) return null;

  return Math.round(number * 2) / 2;

}

function normalizeFilms(rows){

  return (rows || [])
    .map(row => ({
      title:firstValue(row,["name","title","film"]),
      year:parseYear(firstValue(row,["year","release_year"])),
      rating:parseRating(firstValue(row,["rating","your_rating"])),
      uri:firstValue(row,["letterboxd_uri","letterboxd_url","uri"]),
      raw:row
    }))
    .filter(movie => movie.title);
}

function movieKey(movie){

  if(movie.uri){
    return `uri:${movie.uri.toLowerCase()}`;
  }

  return `title:${movie.title.toLowerCase()}|year:${movie.year || ""}`;
}

function dedupeFilms(movies){

  const map = new Map();

  movies.forEach(movie => {

    const key = movieKey(movie);
    const existing = map.get(key);

    if(!existing || (existing.rating === null && movie.rating !== null)){
      map.set(key,movie);
    }

  });

  return Array.from(map.values());
}

function isTruthy(value){

  return ["1","true","yes","y","rewatched"].includes(
    String(value ?? "").trim().toLowerCase()
  );

}

function buildAnalysis(files){

  const rated = dedupeFilms(
    normalizeFilms(
      findFile(files,["ratings","rating"])
    )
  );

  const watched = normalizeFilms(
    findFile(files,["watched"])
  );

  const diary = normalizeFilms(
    findFile(files,["diary"])
  );

  const reviews = findFile(files,["reviews","review"]);
  const watchlist = findFile(files,["watchlist"]);

  const watchedMap = new Map();

  [...watched,...rated,...diary].forEach(movie => {
    const key = movieKey(movie);
    if(key && !watchedMap.has(key)){
      watchedMap.set(key,movie);
    }
  });

  const ratingValues = rated
    .map(movie => movie.rating)
    .filter(Number.isFinite);

  const average = ratingValues.length
    ? ratingValues.reduce((a,b) => a+b,0) / ratingValues.length
    : 0;

  const ratingCounts = new Map(
    [0.5,1,1.5,2,2.5,3,3.5,4,4.5,5].map(
      rating => [rating,0]
    )
  );

  ratingValues.forEach(rating => {
    const rounded = Math.round(rating * 2) / 2;
    if(ratingCounts.has(rounded)){
      ratingCounts.set(
        rounded,
        ratingCounts.get(rounded) + 1
      );
    }
  });

  const decadeMap = new Map();
  const yearMap = new Map();

  rated.forEach(movie => {

    if(!Number.isFinite(movie.year)) return;

    const decade = Math.floor(movie.year / 10) * 10;

    const decadeData = decadeMap.get(decade) || {
      count:0,
      total:0
    };

    decadeData.count++;
    decadeData.total += Number(movie.rating || 0);

    decadeMap.set(decade,decadeData);

    yearMap.set(
      movie.year,
      (yearMap.get(movie.year) || 0) + 1
    );

  });

  const years = rated
    .map(movie => movie.year)
    .filter(Number.isFinite)
    .sort((a,b) => a-b);

  return {
    rated,
    watched:Array.from(watchedMap.values()),
    diary,
    reviews,
    watchlist,
    ratingValues,
    average,
    ratingCounts,
    decadeMap,
    yearMap,
    releaseRange:years.length
      ? `${years[0]}–${years[years.length-1]}`
      : "—",
    rewatched:diary.filter(
      movie => isTruthy(movie.raw?.rewatch)
    ).length
  };
}

function renderAnalysis(data){

  dashboard.hidden = false;
  if(empty) empty.hidden = true;

  setText("dnaMetricWatched",data.watched.length.toLocaleString());
  setText("dnaMetricRated",data.rated.length.toLocaleString());
  setText(
    "dnaMetricAverage",
    data.average ? `${data.average.toFixed(2)}★` : "—"
  );
  setText(
    "dnaMetricElite",
    data.ratingValues.filter(r => r >= 4.5).length.toLocaleString()
  );

  renderRatingChart(data);
  renderDecadeChart(data);
  renderYears(data);
  renderRecords(data);
  renderExtremes(data);
  renderFootprint(data);
  renderInsights(data);

  dashboard.scrollIntoView({
    behavior:"smooth",
    block:"start"
  });

}

function renderRatingChart(data){

  const target = document.getElementById("dnaRatingChart");
  if(!target) return;

  const rows = Array.from(data.ratingCounts.entries());
  const max = Math.max(...rows.map(([,count]) => count),1);

  target.innerHTML = rows.map(([rating,count]) => `
    <div class="bar-row">
      <div class="bar-label">${rating.toFixed(1)}★</div>
      <div class="track">
        <div class="fill" style="width:${count/max*100}%"></div>
      </div>
      <div class="count">${count}</div>
    </div>
  `).join("");

}

function renderDecadeChart(data){

  const target = document.getElementById("dnaDecadeChart");
  if(!target) return;

  const rows = Array.from(data.decadeMap.entries()).sort(
    ([a],[b]) => a-b
  );

  if(!rows.length){
    target.innerHTML = emptyMessage(
      "Release-year information was not available in this export."
    );
    return;
  }

  const max = Math.max(
    ...rows.map(([,value]) => value.count),
    1
  );

  target.innerHTML = rows.map(([decade,value]) => {

    const average = value.count
      ? value.total / value.count
      : 0;

    return `
      <div class="bar-row decade">
        <div class="bar-label">${decade}s</div>
        <div class="track">
          <div class="fill" style="width:${value.count/max*100}%"></div>
        </div>
        <div class="decade-value">
          ${value.count} · ${average.toFixed(1)}★
        </div>
      </div>
    `;

  }).join("");

}

function renderYears(data){

  const target = document.getElementById("dnaYearList");
  if(!target) return;

  const rows = Array.from(data.yearMap.entries())
    .sort((a,b) => b[1]-a[1] || b[0]-a[0])
    .slice(0,8);

  target.innerHTML = rows.length
    ? rows.map(([year,count],index) => `
      <div class="list-row">
        <div class="rank">#${index+1}</div>
        <div class="main">
          <strong>${year}</strong>
          <span>${count} rated film${count === 1 ? "" : "s"}</span>
        </div>
        <div class="rating">${count}</div>
      </div>
    `).join("")
    : emptyMessage("Release years were not available.");

}

function renderRecords(data){

  setText("dnaRecordRelease",data.releaseRange);

  setText(
    "dnaRecordUnrated",
    Math.max(
      data.watched.length - data.rated.length,
      0
    ).toLocaleString()
  );

  setText(
    "dnaRecordUnique",
    data.rated.length.toLocaleString()
  );

  setText(
    "dnaRecordDiary",
    data.diary.length.toLocaleString()
  );

}

function renderExtremes(data){

  const sorted = [...data.rated]
    .filter(movie => Number.isFinite(movie.rating))
    .sort(
      (a,b) =>
        b.rating-a.rating ||
        String(a.title).localeCompare(String(b.title))
    );

  renderFilmList(
    "dnaTopFilms",
    sorted.slice(0,8)
  );

  const lowest = [...sorted].sort(
    (a,b) =>
      a.rating-b.rating ||
      String(a.title).localeCompare(String(b.title))
  );

  renderFilmList(
    "dnaLowFilms",
    lowest.slice(0,8)
  );

}

function renderFilmList(id,movies){

  const target = document.getElementById(id);
  if(!target) return;

  target.innerHTML = movies.length
    ? movies.map((movie,index) => `
      <div class="list-row">
        <div class="rank">#${index+1}</div>
        <div class="main">
          <strong>${escapeHtml(movie.title)}</strong>
          <span>${movie.year || "Year unknown"}</span>
        </div>
        <div class="rating">${Number(movie.rating).toFixed(1)}★</div>
      </div>
    `).join("")
    : emptyMessage("No rated films were found.");

}

function renderFootprint(data){

  const ratings = data.ratingValues;

  setText("dnaFiveStar",ratings.filter(r => r === 5).length);
  setText("dnaFourPlus",ratings.filter(r => r >= 4).length);
  setText("dnaTwoLess",ratings.filter(r => r <= 2).length);
  setText("dnaWatchlist",data.watchlist.length);
  setText("dnaDiary",data.diary.length);
  setText("dnaReviews",data.reviews.length);
  setText("dnaRewatches",data.rewatched);

  setText(
    "dnaRatingRange",
    ratings.length
      ? `${Math.min(...ratings).toFixed(1)}–${Math.max(...ratings).toFixed(1)}★`
      : "—"
  );

}

function renderInsights(data){

  const target = document.getElementById("dnaInsights");
  if(!target) return;

  const insights = [];
  const average = data.average;

  if(average >= 4.25){
    insights.push({
      title:"A generous rating curve",
      body:`Your average rating is ${average.toFixed(2)}★, so your rated films tend to sit toward the upper end of the scale.`
    });
  }else if(average <= 2.75){
    insights.push({
      title:"A demanding rating curve",
      body:`Your average rating is ${average.toFixed(2)}★, so your ratings sit relatively low on the scale.`
    });
  }else{
    insights.push({
      title:"A balanced rating curve",
      body:`Your average rating is ${average.toFixed(2)}★, giving your Letterboxd history a broad middle range.`
    });
  }

  const five = data.ratingValues.filter(r => r === 5).length;
  const fiveShare = data.ratingValues.length
    ? five / data.ratingValues.length
    : 0;

  insights.push(
    fiveShare >= .2
      ? {
          title:"You leave room for masterpieces",
          body:`${five} of your rated films received 5★, making top-tier films a meaningful part of your profile.`
        }
      : {
          title:"Five stars mean something",
          body:`${five} of your rated films received 5★, so the very top of your scale is relatively selective.`
        }
  );

  const decades = Array.from(data.decadeMap.entries()).sort(
    (a,b) => b[1].count-a[1].count
  );

  if(decades.length){
    const top = decades[0];
    insights.push({
      title:`Your strongest era: the ${top[0]}s`,
      body:`${top[1].count} rated films in your export come from the ${top[0]}s, making it your most represented release decade.`
    });
  }

  const years = Array.from(data.yearMap.entries()).sort(
    (a,b) => b[1]-a[1] || b[0]-a[0]
  );

  if(years.length){
    const top = years[0];
    insights.push({
      title:`A recurring year: ${top[0]}`,
      body:`${top[0]} appears ${top[1]} time${top[1] === 1 ? "" : "s"} among your rated films.`
    });
  }

  insights.push(
    data.rewatched
      ? {
          title:"You revisit films",
          body:`${data.rewatched} diary entr${data.rewatched === 1 ? "y suggests" : "ies suggest"} that rewatching is part of your viewing pattern.`
        }
      : {
          title:"Discovery over repetition",
          body:"No rewatch signal was detected in the available diary data."
        }
  );

  if(data.watchlist.length){
    insights.push({
      title:"Your queue is part of the picture",
      body:`Your export contains ${data.watchlist.length.toLocaleString()} watchlist entr${data.watchlist.length === 1 ? "y" : "ies"}.`
    });
  }

  target.innerHTML = insights.slice(0,6).map(item => `
    <article class="insight">
      <strong>${escapeHtml(item.title)}</strong>
      ${escapeHtml(item.body)}
    </article>
  `).join("");

}

function setText(id,value){

  const element = document.getElementById(id);
  if(element) element.textContent = String(value);

}

function emptyMessage(message){

  return `
    <div style="color:rgba(234,242,251,.40);font-size:11px;line-height:1.6;padding:8px 0">
      ${escapeHtml(message)}
    </div>
  `;

}

function escapeHtml(value){

  return String(value ?? "")
    .replace(/&/g,"&amp;")
    .replace(/</g,"&lt;")
    .replace(/>/g,"&gt;")
    .replace(/"/g,"&quot;")
    .replace(/'/g,"&#039;");

}

function setStatus(message,error=false){

  if(!status) return;

  status.textContent = message;
  status.classList.toggle("error",error);

}

function resetAnalysis(){

  dashboard.hidden = true;
  if(empty) empty.hidden = false;

  upload.value = "";

  setStatus("Waiting for your Letterboxd export.");

  const anchor =
    document.getElementById("filmDnaMode") ||
    document.querySelector(".hero");

  if(anchor){
    anchor.scrollIntoView({
      behavior:"smooth",
      block:"start"
    });
  }

}

/* Background parallax — same motion language as the main site. */
if(window.matchMedia("(pointer:fine)").matches){

  const root = document.documentElement;

  let targetX = 0;
  let targetY = 0;
  let currentX = 0;
  let currentY = 0;

  window.addEventListener("pointermove",event => {

    targetX =
      (event.clientX/window.innerWidth-.5)*-12;

    targetY =
      (event.clientY/window.innerHeight-.5)*-8;

    root.style.setProperty(
      "--mouse-x",
      `${event.clientX/window.innerWidth*100}%`
    );

    root.style.setProperty(
      "--mouse-y",
      `${event.clientY/window.innerHeight*100}%`
    );

  },{passive:true});

  function animate(){

    currentX += (targetX-currentX)*.05;
    currentY += (targetY-currentY)*.05;

    root.style.setProperty(
      "--bg-x",
      `${currentX.toFixed(2)}px`
    );

    root.style.setProperty(
      "--bg-y",
      `${currentY.toFixed(2)}px`
    );

    requestAnimationFrame(animate);
  }

  animate();

}

})();
