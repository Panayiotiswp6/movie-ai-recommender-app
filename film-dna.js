/*
 MovieMind — Your Film DNA
 Local Letterboxd ZIP analyzer.

 FIX:
 The analyzer waits for JSZip instead of silently stopping.
 If the main JSZip CDN fails, it attempts a second CDN.
 The ZIP upload listener is attached immediately, so selecting
 a Letterboxd ZIP always starts the analysis.
*/

(function(){
  "use strict";

  const upload = document.getElementById("letterboxdUpload");
  if(!upload) return;

  const dropzone = document.getElementById("filmDnaDropzone");
  const status = document.getElementById("filmDnaStatus");
  const dashboard = document.getElementById("filmDnaDashboard");
  const empty = document.getElementById("filmDnaEmpty");
  const reset = document.getElementById("filmDnaReset");

  let zipReady = null;


  /* =========================================================
     JSZIP LOADER
  ========================================================= */

  function ensureJSZip(){

    if(window.JSZip){
      return Promise.resolve(window.JSZip);
    }

    if(zipReady){
      return zipReady;
    }

    zipReady = new Promise((resolve,reject) => {

      setStatus(
        "Preparing the Letterboxd reader..."
      );

      /*
       * First check whether another JSZip script
       * is already loading.
       */

      const existing =
        document.querySelector(
          'script[data-moviemind-jszip]'
        );

      if(existing){

        existing.addEventListener(
          "load",
          () => {

            if(window.JSZip){
              resolve(window.JSZip);
            }else{
              reject(
                new Error(
                  "The ZIP reader could not be loaded."
                )
              );
            }

          },
          {once:true}
        );

        existing.addEventListener(
          "error",
          () => {

            reject(
              new Error(
                "The ZIP reader could not be loaded."
              )
            );

          },
          {once:true}
        );

        return;
      }


      /*
       * Try loading JSZip ourselves.
       */

      const script =
        document.createElement("script");

      script.src =
        "https://unpkg.com/jszip@3.10.1/dist/jszip.min.js";

      script.async = true;

      script.dataset.moviemindJszip = "true";


      script.onload = () => {

        if(window.JSZip){

          resolve(window.JSZip);

        }else{

          /*
           * The script loaded but JSZip wasn't exposed.
           * Try the secondary CDN.
           */

          loadSecondaryJSZip(resolve,reject);

        }

      };


      script.onerror = () => {

        /*
         * Primary CDN failed.
         * Try secondary CDN.
         */

        loadSecondaryJSZip(resolve,reject);

      };


      document.head.appendChild(script);

    });

    return zipReady;
  }


  function loadSecondaryJSZip(resolve,reject){

    if(window.JSZip){
      resolve(window.JSZip);
      return;
    }


    const secondary =
      document.createElement("script");

    secondary.src =
      "https://cdn.jsdelivr.net/npm/jszip@3.10.1/dist/jszip.min.js";

    secondary.async = true;

    secondary.dataset.moviemindJszip =
      "true";


    secondary.onload = () => {

      if(window.JSZip){

        resolve(window.JSZip);

      }else{

        reject(
          new Error(
            "The ZIP reader loaded but was not available."
          )
        );

      }

    };


    secondary.onerror = () => {

      reject(
        new Error(
          "Could not load the ZIP reader. Please refresh the page and try again."
        )
      );

    };


    document.head.appendChild(
      secondary
    );

  }


  /* =========================================================
     FILE INPUT
  ========================================================= */

  upload.addEventListener(
    "change",
    event => {

      const files =
        event.target.files;

      if(
        !files ||
        !files.length
      ){
        return;
      }

      const file =
        files[0];

      analyzeFile(file);

    }
  );


  /* =========================================================
     DRAG & DROP
  ========================================================= */

  if(dropzone){

    [
      "dragenter",
      "dragover"
    ].forEach(
      eventName => {

        dropzone.addEventListener(
          eventName,
          event => {

            event.preventDefault();
            event.stopPropagation();

            dropzone.classList.add(
              "dragging"
            );

          }
        );

      }
    );


    [
      "dragleave",
      "drop"
    ].forEach(
      eventName => {

        dropzone.addEventListener(
          eventName,
          event => {

            event.preventDefault();
            event.stopPropagation();

            dropzone.classList.remove(
              "dragging"
            );

          }
        );

      }
    );


    dropzone.addEventListener(
      "drop",
      event => {

        const files =
          event.dataTransfer &&
          event.dataTransfer.files;

        if(
          !files ||
          !files.length
        ){
          return;
        }


        const file =
          files[0];


        const filename =
          String(
            file.name || ""
          ).toLowerCase();


        const validZip =
          filename.endsWith(".zip") ||
          file.type === "application/zip" ||
          file.type === "application/x-zip-compressed";


        if(validZip){

          analyzeFile(file);

        }else{

          setStatus(
            "Please choose a Letterboxd ZIP export.",
            true
          );

        }

      }
    );

  }


  /* =========================================================
     RESET
  ========================================================= */

  if(reset){

    reset.addEventListener(
      "click",
      resetAnalysis
    );

  }


  /* =========================================================
     ANALYZE ZIP
  ========================================================= */

  async function analyzeFile(file){

    try{

      if(!file){

        throw new Error(
          "No file was selected."
        );

      }


      if(file.size === 0){

        throw new Error(
          "The selected file is empty."
        );

      }


      setStatus(
        "Reading your Letterboxd universe..."
      );


      /*
       * Make sure JSZip exists.
       */

      const Zip =
        await ensureJSZip();


      /*
       * Open the actual ZIP file.
       */

      const zip =
        await Zip.loadAsync(
          file
        );


      /*
       * Find every CSV inside the ZIP.
       */

      const csvEntries =
        Object.values(
          zip.files
        ).filter(
          entry =>
            !entry.dir &&
            entry.name
              .toLowerCase()
              .endsWith(".csv")
        );


      if(!csvEntries.length){

        throw new Error(
          "No CSV files were found inside this export."
        );

      }


      setStatus(
        `Reading ${csvEntries.length.toLocaleString()} Letterboxd data files...`
      );


      const files = {};


      /*
       * Parse every CSV.
       */

      for(
        const entry
        of csvEntries
      ){

        const filename =
          entry.name
            .split("/")
            .pop()
            .replace(
              /\.csv$/i,
              ""
            )
            .toLowerCase();


        const csvText =
          await entry.async(
            "text"
          );


        files[filename] =
          parseCSV(
            csvText
          );

      }


      /*
       * Build the Film DNA profile.
       */

      const data =
        buildAnalysis(
          files
        );


      /*
       * Render everything.
       */

      renderAnalysis(
        data
      );


      setStatus(
        `Analysis complete · ${data.rated.length.toLocaleString()} rated films found.`
      );


    }catch(error){

      console.error(
        "MovieMind Film DNA error:",
        error
      );


      setStatus(
        error &&
        error.message
          ? error.message
          : "MovieMind could not read this export.",
        true
      );

    }

  }


  /* =========================================================
     CSV PARSER
  ========================================================= */

  function parseCSV(text){

    const rows = [];

    let row = [];

    let cell = "";

    let quoted = false;


    for(
      let i = 0;
      i < text.length;
      i++
    ){

      const char =
        text[i];

      const next =
        text[i + 1];


      /*
       * Quoted CSV field.
       */

      if(char === '"'){

        if(
          quoted &&
          next === '"'
        ){

          cell += '"';

          i++;

        }else{

          quoted =
            !quoted;

        }

        continue;
      }


      /*
       * Column separator.
       */

      if(
        char === "," &&
        !quoted
      ){

        row.push(
          cell
        );

        cell = "";

        continue;
      }


      /*
       * Row separator.
       */

      if(
        (
          char === "\n" ||
          char === "\r"
        ) &&
        !quoted
      ){

        if(
          char === "\r" &&
          next === "\n"
        ){

          i++;

        }


        row.push(
          cell
        );

        cell = "";


        if(
          row.some(
            value =>
              String(value).trim() !== ""
          )
        ){

          rows.push(
            row
          );

        }


        row = [];

        continue;
      }


      cell += char;

    }


    /*
     * Last row.
     */

    if(
      cell !== "" ||
      row.length
    ){

      row.push(
        cell
      );


      if(
        row.some(
          value =>
            String(value).trim() !== ""
        )
      ){

        rows.push(
          row
        );

      }

    }


    if(!rows.length){

      return [];

    }


    /*
     * Normalize headers.
     */

    const headers =
      rows[0].map(
        normalizeHeader
      );


    /*
     * Convert rows to objects.
     */

    return rows
      .slice(1)
      .map(
        values => {

          const object = {};


          headers.forEach(
            (
              header,
              index
            ) => {

              object[header] =
                String(
                  values[index] ?? ""
                ).trim();

            }
          );


          return object;

        }
      )
      .filter(
        row =>
          Object.values(row)
            .some(
              value =>
                value !== ""
            )
      );

  }


  function normalizeHeader(value){

    return String(
      value ?? ""
    )
      .trim()
      .replace(
        /^\uFEFF/,
        ""
      )
      .toLowerCase()
      .replace(
        /[^a-z0-9]+/g,
        "_"
      )
      .replace(
        /^_|_$/g,
        ""
      );

  }


  /* =========================================================
     DATA HELPERS
  ========================================================= */

  function findFile(
    files,
    names
  ){

    for(
      const name
      of names
    ){

      if(
        Array.isArray(
          files[name]
        )
      ){

        return files[name];

      }

    }

    return [];

  }


  function firstValue(
    row,
    keys
  ){

    for(
      const key
      of keys
    ){

      if(
        row &&
        row[key] !== undefined &&
        row[key] !== ""
      ){

        return row[key];

      }

    }

    return "";

  }


  function parseYear(
    value
  ){

    const match =
      String(
        value ?? ""
      ).match(
        /\b(18|19|20)\d{2}\b/
      );


    return match
      ? Number(match[0])
      : null;

  }


  function parseRating(
    value
  ){

    if(
      value === null ||
      value === undefined ||
      value === ""
    ){

      return null;

    }


    const number =
      Number(
        String(value)
          .replace(
            ",",
            "."
          )
      );


    return Number.isFinite(number)
      ? Math.round(number * 2) / 2
      : null;

  }


  function normalizeFilms(
    rows
  ){

    return (
      rows || []
    )
      .map(
        row => ({

          title:
            firstValue(
              row,
              [
                "name",
                "title",
                "film"
              ]
            ),

          year:
            parseYear(
              firstValue(
                row,
                [
                  "year",
                  "release_year"
                ]
              )
            ),

          rating:
            parseRating(
              firstValue(
                row,
                [
                  "rating",
                  "your_rating"
                ]
              )
            ),

          uri:
            firstValue(
              row,
              [
                "letterboxd_uri",
                "letterboxd_url",
                "uri"
              ]
            ),

          raw:
            row

        })
      )
      .filter(
        movie =>
          movie.title
      );

  }


  function movieKey(
    movie
  ){

    if(movie.uri){

      return (
        "uri:" +
        movie.uri
          .toLowerCase()
      );

    }


    return (
      "title:" +
      movie.title
        .toLowerCase() +
      "|year:" +
      (
        movie.year || ""
      )
    );

  }


  function dedupeFilms(
    movies
  ){

    const map =
      new Map();


    movies.forEach(
      movie => {

        const key =
          movieKey(
            movie
          );


        const existing =
          map.get(
            key
          );


        if(
          !existing ||
          (
            existing.rating === null &&
            movie.rating !== null
          )
        ){

          map.set(
            key,
            movie
          );

        }

      }
    );


    return Array.from(
      map.values()
    );

  }


  function isTruthy(
    value
  ){

    return [
      "1",
      "true",
      "yes",
      "y",
      "rewatched"
    ].includes(
      String(
        value ?? ""
      )
        .trim()
        .toLowerCase()
    );

  }


  /* =========================================================
     BUILD FILM DNA
  ========================================================= */

  function buildAnalysis(
    files
  ){

    const rated =
      dedupeFilms(
        normalizeFilms(
          findFile(
            files,
            [
              "ratings",
              "rating"
            ]
          )
        )
      );


    const watched =
      normalizeFilms(
        findFile(
          files,
          [
            "watched"
          ]
        )
      );


    const diary =
      normalizeFilms(
        findFile(
          files,
          [
            "diary"
          ]
        )
      );


    const reviews =
      findFile(
        files,
        [
          "reviews",
          "review"
        ]
      );


    const watchlist =
      findFile(
        files,
        [
          "watchlist"
        ]
      );


    /*
     * Combine watched, rated and diary records.
     */

    const watchedMap =
      new Map();


    [
      ...watched,
      ...rated,
      ...diary
    ].forEach(
      movie => {

        const key =
          movieKey(
            movie
          );


        if(
          key &&
          !watchedMap.has(
            key
          )
        ){

          watchedMap.set(
            key,
            movie
          );

        }

      }
    );


    /*
     * Ratings.
     */

    const ratingValues =
      rated
        .map(
          movie =>
            movie.rating
        )
        .filter(
          Number.isFinite
        );


    const average =
      ratingValues.length
        ? ratingValues.reduce(
            (
              a,
              b
            ) => a + b,
            0
          ) /
          ratingValues.length
        : 0;


    /*
     * Rating distribution.
     */

    const ratingCounts =
      new Map(
        [
          0.5,
          1,
          1.5,
          2,
          2.5,
          3,
          3.5,
          4,
          4.5,
          5
        ].map(
          rating =>
            [
              rating,
              0
            ]
        )
      );


    ratingValues.forEach(
      rating => {

        const rounded =
          Math.round(
            rating * 2
          ) / 2;


        if(
          ratingCounts.has(
            rounded
          )
        ){

          ratingCounts.set(
            rounded,
            ratingCounts.get(
              rounded
            ) + 1
          );

        }

      }
    );


    /*
     * Decades and years.
     */

    const decadeMap =
      new Map();


    const yearMap =
      new Map();


    rated.forEach(
      movie => {

        if(
          !Number.isFinite(
            movie.year
          )
        ){

          return;

        }


        const decade =
          Math.floor(
            movie.year / 10
          ) * 10;


        const decadeData =
          decadeMap.get(
            decade
          ) || {
            count:0,
            total:0
          };


        decadeData.count++;

        decadeData.total +=
          Number(
            movie.rating || 0
          );


        decadeMap.set(
          decade,
          decadeData
        );


        yearMap.set(
          movie.year,
          (
            yearMap.get(
              movie.year
            ) || 0
          ) + 1
        );

      }
    );


    const years =
      rated
        .map(
          movie =>
            movie.year
        )
        .filter(
          Number.isFinite
        )
        .sort(
          (
            a,
            b
          ) => a - b
        );


    return {

      rated,

      watched:
        Array.from(
          watchedMap.values()
        ),

      diary,

      reviews,

      watchlist,

      ratingValues,

      average,

      ratingCounts,

      decadeMap,

      yearMap,

      releaseRange:
        years.length
          ? `${years[0]}–${years[years.length - 1]}`
          : "—",

      rewatched:
        diary.filter(
          movie =>
            isTruthy(
              movie.raw?.rewatch
            )
        ).length

    };

  }


  /* =========================================================
     RENDER
  ========================================================= */

  function renderAnalysis(
    data
  ){

    dashboard.hidden =
      false;


    if(empty){

      empty.hidden =
        true;

    }


    setText(
      "dnaMetricWatched",
      data.watched.length
        .toLocaleString()
    );


    setText(
      "dnaMetricRated",
      data.rated.length
        .toLocaleString()
    );


    setText(
      "dnaMetricAverage",
      data.average
        ? `${data.average.toFixed(2)}★`
        : "—"
    );


    setText(
      "dnaMetricElite",
      data.ratingValues
        .filter(
          rating =>
            rating >= 4.5
        )
        .length
        .toLocaleString()
    );


    renderRatingChart(
      data
    );


    renderDecadeChart(
      data
    );


    renderYears(
      data
    );


    renderRecords(
      data
    );


    renderExtremes(
      data
    );


    renderFootprint(
      data
    );


    renderInsights(
      data
    );


    dashboard.scrollIntoView(
      {
        behavior:"smooth",
        block:"start"
      }
    );

  }


  /* =========================================================
     RATING CHART
  ========================================================= */

  function renderRatingChart(
    data
  ){

    const target =
      document.getElementById(
        "dnaRatingChart"
      );


    if(!target){
      return;
    }


    const rows =
      Array.from(
        data.ratingCounts.entries()
      );


    const max =
      Math.max(
        ...rows.map(
          (
            [
              ,
              count
            ]
          ) => count
        ),
        1
      );


    target.innerHTML =
      rows.map(
        (
          [
            rating,
            count
          ]
        ) => `

          <div class="dna-bar">

            <div class="dna-bar-label">
              ${rating.toFixed(1)}★
            </div>

            <div class="dna-bar-track">

              <div
                class="dna-bar-fill"
                style="width:${count / max * 100}%"
              ></div>

            </div>

            <div class="dna-bar-count">
              ${count}
            </div>

          </div>

        `
      ).join("");

  }


  /* =========================================================
     DECADE CHART
  ========================================================= */

  function renderDecadeChart(
    data
  ){

    const target =
      document.getElementById(
        "dnaDecadeChart"
      );


    if(!target){
      return;
    }


    const rows =
      Array.from(
        data.decadeMap.entries()
      )
      .sort(
        (
          [
            a
          ],
          [
            b
          ]
        ) => a - b
      );


    if(!rows.length){

      target.innerHTML =
        emptyMessage(
          "Release-year information was not available in this export."
        );

      return;

    }


    const max =
      Math.max(
        ...rows.map(
          (
            [
              ,
              value
            ]
          ) => value.count
        ),
        1
      );


    target.innerHTML =
      rows.map(
        (
          [
            decade,
            value
          ]
        ) => {

          const average =
            value.count
              ? value.total /
                value.count
              : 0;


          const percentage =
            Math.max(
              value.count /
              max *
              100,
              6
            );


          return `

            <div class="dna-timeline-item">

              <div class="dna-frame">

                <div
                  class="dna-frame-fill"
                  style="--fill:${percentage}%"
                ></div>

              </div>

              <div class="dna-timeline-decade">
                ${decade}s
              </div>

              <div class="dna-timeline-meta">
                ${value.count} · ${average.toFixed(1)}★
              </div>

            </div>

          `;

        }
      ).join("");

  }


  /* =========================================================
     YEARS
  ========================================================= */

  function renderYears(
    data
  ){

    const target =
      document.getElementById(
        "dnaYearList"
      );


    if(!target){
      return;
    }


    const rows =
      Array.from(
        data.yearMap.entries()
      )
      .sort(
        (
          a,
          b
        ) =>
          b[1] - a[1] ||
          b[0] - a[0]
      )
      .slice(
        0,
        8
      );


    target.innerHTML =
      rows.length
        ? rows.map(
            (
              [
                year,
                count
              ],
              index
            ) => `

              <div class="dna-row">

                <div class="dna-row-rank">
                  ${index + 1}
                </div>

                <div class="dna-row-main">

                  <strong>
                    ${year}
                  </strong>

                  <span>
                    ${count}
                    rated film${count === 1 ? "" : "s"}
                  </span>

                </div>

                <div class="dna-row-value">
                  ${count}
                </div>

              </div>

            `
          ).join("")
        : emptyMessage(
            "Release years were not available."
          );

  }


  /* =========================================================
     RECORDS
  ========================================================= */

  function renderRecords(
    data
  ){

    setText(
      "dnaRecordRelease",
      data.releaseRange
    );


    setText(
      "dnaRecordUnrated",
      Math.max(
        data.watched.length -
        data.rated.length,
        0
      ).toLocaleString()
    );


    setText(
      "dnaRecordUnique",
      data.rated.length
        .toLocaleString()
    );


    setText(
      "dnaRecordDiary",
      data.diary.length
        .toLocaleString()
    );

  }


  /* =========================================================
     HIGHEST / LOWEST
  ========================================================= */

  function renderExtremes(
    data
  ){

    const sorted =
      [
        ...data.rated
      ]
      .filter(
        movie =>
          Number.isFinite(
            movie.rating
          )
      )
      .sort(
        (
          a,
          b
        ) =>
          b.rating -
          a.rating ||
          String(a.title)
            .localeCompare(
              String(b.title)
            )
      );


    renderFilmList(
      "dnaTopFilms",
      sorted.slice(
        0,
        8
      )
    );


    const lowest =
      [
        ...sorted
      ]
      .sort(
        (
          a,
          b
        ) =>
          a.rating -
          b.rating ||
          String(a.title)
            .localeCompare(
              String(b.title)
            )
      );


    renderFilmList(
      "dnaLowFilms",
      lowest.slice(
        0,
        8
      )
    );

  }


  function renderFilmList(
    id,
    movies
  ){

    const target =
      document.getElementById(
        id
      );


    if(!target){
      return;
    }


    target.innerHTML =
      movies.length

        ? movies.map(
            (
              movie,
              index
            ) => `

              <div class="dna-row">

                <div class="dna-row-rank">
                  ${index + 1}
                </div>

                <div class="dna-row-main">

                  <strong>
                    ${escapeHtml(
                      movie.title
                    )}
                  </strong>

                  <span>
                    ${movie.year || "Year unknown"}
                  </span>

                </div>

                <div class="dna-row-value">
                  ${Number(
                    movie.rating
                  ).toFixed(1)}★
                </div>

              </div>

            `
          ).join("")

        : emptyMessage(
            "No rated films were found."
          );

  }


  /* =========================================================
     LETTERBOXD FOOTPRINT
  ========================================================= */

  function renderFootprint(
    data
  ){

    const ratings =
      data.ratingValues;


    setText(
      "dnaFiveStar",
      ratings.filter(
        rating =>
          rating === 5
      ).length
    );


    setText(
      "dnaFourPlus",
      ratings.filter(
        rating =>
          rating >= 4
      ).length
    );


    setText(
      "dnaTwoLess",
      ratings.filter(
        rating =>
          rating <= 2
      ).length
    );


    setText(
      "dnaWatchlist",
      data.watchlist.length
    );


    setText(
      "dnaDiary",
      data.diary.length
    );


    setText(
      "dnaReviews",
      data.reviews.length
    );


    setText(
      "dnaRewatches",
      data.rewatched
    );


    setText(
      "dnaRatingRange",
      ratings.length
        ? `${Math.min(...ratings).toFixed(1)}–${Math.max(...ratings).toFixed(1)}★`
        : "—"
    );

  }


  /* =========================================================
     INSIGHTS
  ========================================================= */

  function renderInsights(
    data
  ){

    const target =
      document.getElementById(
        "dnaInsights"
      );


    if(!target){
      return;
    }


    const insights = [];

    const average =
      data.average;


    if(
      average >= 4.25
    ){

      insights.push({

        title:
          "You rate generously",

        body:
          `Averaging ${average.toFixed(2)}★, you tend to find something to love in most films you watch — five stars aren't rare around here.`

      });

    }else if(
      average <= 2.75
    ){

      insights.push({

        title:
          "You're a tough critic",

        body:
          `Averaging ${average.toFixed(2)}★, a film has to earn its stars with you — you're not handing out praise just for showing up.`

      });

    }else{

      insights.push({

        title:
          "A balanced rating curve",

        body:
          `Averaging ${average.toFixed(2)}★, your ratings spread across a broad middle range rather than clustering at either end.`

      });

    }


    const five =
      data.ratingValues.filter(
        rating =>
          rating === 5
      ).length;


    const fiveShare =
      data.ratingValues.length
        ? five /
          data.ratingValues.length
        : 0;


    insights.push(

      fiveShare >= 0.2

        ? {

            title:
              "You leave room for masterpieces",

            body:
              `${five} of your rated films received 5★, so top-tier ratings are a meaningful part of your profile.`

          }

        : {

            title:
              "Five stars mean something",

            body:
              `Only ${five} of your rated films hit 5★ — the very top of your scale is genuinely selective.`

          }

    );


    const decades =
      Array.from(
        data.decadeMap.entries()
      )
      .sort(
        (
          a,
          b
        ) =>
          b[1].count -
          a[1].count
      );


    if(
      decades.length
    ){

      const top =
        decades[0];


      insights.push({

        title:
          `Your strongest era: the ${top[0]}s`,

        body:
          `${top[1].count} rated films come from the ${top[0]}s, making it the most represented decade in your history.`

      });

    }


    const years =
      Array.from(
        data.yearMap.entries()
      )
      .sort(
        (
          a,
          b
        ) =>
          b[1] -
          a[1]
          ||
          b[0] -
          a[0]
      );


    if(
      years.length
    ){

      const top =
        years[0];


      insights.push({

        title:
          `A recurring year: ${top[0]}`,

        body:
          `${top[0]} appears ${top[1]} time${top[1] === 1 ? "" : "s"} among your rated films — more than any other year.`

      });

    }


    insights.push(

      data.rewatched

        ? {

            title:
              "You revisit films",

            body:
              `${data.rewatched} diary entr${data.rewatched === 1 ? "y suggests" : "ies suggest"} rewatching is part of how you watch, not just discovering new titles.`

          }

        : {

            title:
              "Discovery over repetition",

            body:
              "No rewatch signal turned up in your diary — your history leans toward new titles over revisits."

          }

    );


    if(
      data.reviews.length
    ){

      insights.push({

        title:
          "You write about what you watch",

        body:
          `Your export contains ${data.reviews.length.toLocaleString()} review${data.reviews.length === 1 ? "" : "s"} — you don't just rate films, you reason about them.`

      });

    }


    if(
      data.watchlist.length
    ){

      insights.push({

        title:
          "Your queue is part of the picture",

        body:
          `${data.watchlist.length.toLocaleString()} watchlist entr${data.watchlist.length === 1 ? "y" : "ies"} are waiting — your taste is still actively expanding.`

      });

    }


    target.innerHTML =
      insights
        .slice(
          0,
          8
        )
        .map(
          (
            item,
            index
          ) => `

            <article class="dna-insight">

              <div class="dna-insight-num">
                ${index + 1}
              </div>

              <div class="dna-insight-body">

                <strong>
                  ${escapeHtml(
                    item.title
                  )}
                </strong>

                <p>
                  ${escapeHtml(
                    item.body
                  )}
                </p>

              </div>

            </article>

          `
        )
        .join("");

  }


  /* =========================================================
     UI HELPERS
  ========================================================= */

  function setText(
    id,
    value
  ){

    const element =
      document.getElementById(
        id
      );


    if(element){

      element.textContent =
        String(value);

    }

  }


  function emptyMessage(
    message
  ){

    return `

      <div
        style="
          color:rgba(234,242,251,.40);
          font-size:11px;
          line-height:1.6;
          padding:8px 0
        "
      >
        ${escapeHtml(
          message
        )}
      </div>

    `;

  }


  function escapeHtml(
    value
  ){

    return String(
      value ?? ""
    )
      .replace(
        /&/g,
        "&amp;"
      )
      .replace(
        /</g,
        "&lt;"
      )
      .replace(
        />/g,
        "&gt;"
      )
      .replace(
        /"/g,
        "&quot;"
      )
      .replace(
        /'/g,
        "&#039;"
      );

  }


  function setStatus(
    message,
    error = false
  ){

    if(!status){
      return;
    }


    status.textContent =
      message;


    status.classList.toggle(
      "error",
      error
    );

  }


  /* =========================================================
     RESET
  ========================================================= */

  function resetAnalysis(){

    dashboard.hidden =
      true;


    if(empty){

      empty.hidden =
        false;

    }


    upload.value =
      "";


    setStatus(
      "Waiting for your Letterboxd export."
    );


    const anchor =
      document.getElementById(
        "filmDnaMode"
      );


    if(anchor){

      anchor.scrollIntoView(
        {
          behavior:"smooth",
          block:"start"
        }
      );

    }

  }


  /* =========================================================
     PRELOAD JSZIP
     
     This happens in the background.
     It does NOT prevent the upload listener
     from being registered.
  ========================================================= */

  ensureJSZip()
    .catch(
      error => {

        console.warn(
          "MovieMind: JSZip preload failed. It will retry when a ZIP is selected.",
          error
        );

      }
    );

})();
