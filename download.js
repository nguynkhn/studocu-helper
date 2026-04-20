const DOWNLOAD_BUTTON_ID = "studotools-download-btn";
const DOCUMENT_CONTAINER_ID = "studotools-document-container";
const DOCUMENT_SOURCES = [
  // Studocu
  {
    urlRegex: /(^|\.)((studeersnel\.nl)|(studocu\.(com|id|vn)))$/i,
    buttonContainerSelector: ".TopbarActions_secondary-actions-wrapper__4u75_",
    buttonSelector: ".Button_button__88E9y",
    fetchDocument: async () => {
      const { documentAccess, pageDataList } = window.__NEXT_DATA__.props.pageProps;
      const { url, objectKey, signedQueryParams } = documentAccess;
      const params = signedQueryParams.global;

      const pageRequests = pageDataList.map(async ({ pageNumber, pageHtmlWrapper }) => {
        const pageUrl = `${url}${objectKey}${pageNumber}.page${params}`;
        const backgroundFile = `bg${pageNumber.toString(16)}.png`;
        const backgroundUrl = `${url}${backgroundFile}${params}`;

        const pageResponse = await fetch(pageUrl);
        const pageResponseText = await pageResponse.text();
        const pageContent = pageResponseText.replace(backgroundFile, backgroundUrl);

        return `${pageHtmlWrapper}${pageContent}</div>`;
      });

      const firstImage = document.querySelector('div[data-page-index="0"] img');
      const scale = firstImage.naturalWidth / firstImage.clientWidth;

      const pageContents = await Promise.all(pageRequests);
      return `
<div class="p2hv" style="transform:scale(${scale});transform-origin:top left;">
  <div id="page-container">${pageContents.join("")}</div>
</div>
`;
    },
  },
  // Scribd
  {
    urlRegex: /(^|\.)scribd\.com$/i,
    buttonContainerSelector: "._12sL1I",
    buttonSelector: ".ButtonCore-module_wrapper_MkTb9s",
    fetchDocument: async () => {
      const { pages } = window.docManager;
      const pageRequests = Object.entries(pages).map(async ([ pageNo, pageData ]) => {
        const { contentUrl, containerElem, origWidth, origHeight } = pageData;

        const pageResponse = await fetch(contentUrl);
        const pageResponseText = await pageResponse.text();
        const pageEscapedContent = pageResponseText
          .replace(`window.page${pageNo}_callback([`, "")
          .replace(/]\);\s*$/, "");

        const pageContent = JSON.parse(pageEscapedContent).replace(
          /orig="http:\/\/html\.scribd\.com/g,
          "style=\"display: block;\" src=\"https://html.scribdassets.com"
        );

        const tempElement = containerElem.cloneNode();
        tempElement.innerHTML = pageContent;
        tempElement.style.width = `${origWidth}px`;
        tempElement.style.height = `${origHeight}px`;

        return tempElement.outerHTML;
      });

      const pageContents = await Promise.all(pageRequests);
      return pageContents.join("");
    },
  },
];
const documentSource = DOCUMENT_SOURCES.find(source => source.urlRegex.test(location.hostname));
let isDownloading = false;

async function downloadDocument() {
  if (isDownloading) {
    return;
  }
  isDownloading = true;

  const downloadButton = document.getElementById(DOWNLOAD_BUTTON_ID);
  downloadButton.textContent = "Fetching document...";

  let documentContainer = document.getElementById(DOCUMENT_CONTAINER_ID);
  if (!documentContainer) {
    documentContainer = document.createElement("div");
    documentContainer.id = DOCUMENT_CONTAINER_ID;
    documentContainer.innerHTML = await documentSource.fetchDocument();

    document.body.prepend(documentContainer);
  }

  let loadedCount = 0;
  const images = Array.from(documentContainer.querySelectorAll("img"));
  const imagePromises = images.map(image => new Promise(resolve => {
    const _resolve = () => {
      downloadButton.textContent = `Loading images (${++loadedCount}/${images.length})...`;
      resolve();
    };

    if (image.complete) {
      _resolve();
      return;
    }
    image.onload = image.onerror = _resolve;
  }))
  await Promise.all(imagePromises);
  await document.fonts?.ready;

  downloadButton.textContent = "Downloading...";
  window.addEventListener("afterprint", () => {
    isDownloading = false;
    downloadButton.textContent = "Download as PDF";
  });
  window.print();
}

function createDownloadButton() {
  if (document.getElementById(DOWNLOAD_BUTTON_ID)) {
    return;
  }

  const buttonContainer = document.querySelector(documentSource.buttonContainerSelector);
  const pseudoDownloadButton = buttonContainer?.querySelector(documentSource.buttonSelector);
  const downloadButton = pseudoDownloadButton?.cloneNode();
  if (!downloadButton) {
    return;
  }

  downloadButton.id = DOWNLOAD_BUTTON_ID;
  downloadButton.textContent = "Download as PDF";
  downloadButton.disabled = false;
  downloadButton.style.pointerEvents = "auto";
  downloadButton.style.cursor = "pointer";
  downloadButton.onclick = downloadDocument;

  buttonContainer.prepend(downloadButton);
}

const style = document.createElement("style");
style.textContent = `
#${DOCUMENT_CONTAINER_ID} {
    display: none;
}
@media print {
    @page {
        margin: 0;
        size: auto;
    }
    #${DOCUMENT_CONTAINER_ID} {
        display: block !important;
        position: absolute;
        top: 0;
        left: 0;
    }
    #${DOCUMENT_CONTAINER_ID}, #${DOCUMENT_CONTAINER_ID} * {
        margin: 0;
        visibility: visible;
        box-shadow: none;
        page-break-after: always;
        break-after: always;
        border: none;
    }
    body * {
        visibility: hidden;
    }
}
`;

window.addEventListener("DOMContentLoaded", () => {
  document.body.appendChild(style);

  const observer = new MutationObserver(createDownloadButton);
  observer.observe(document.body, { childList: true, subtree: true });
});

