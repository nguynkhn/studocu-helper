const DOCUMENT_CONTAINER_ID = 'studotools-document-container';
const DOWNLOAD_BUTTON_ID = 'studotools-download-button';
const DOCUMENT_SOURCES = [
  // Studocu
  {
    domainNames: ['studeersnel.nl', 'studocu.com', 'studocu.id', 'studocu.vn'],
    buttonContainerSelector: '.TopbarActions_secondary-actions-wrapper__4u75_',
    buttonSelector: '.Button_button__88E9y',
    fetchDocument: async () => {
      const { documentAccess, pageDataList, seoData } = window.__NEXT_DATA__.props.pageProps;
      const { url, objectKey, signedQueryParams } = documentAccess;
      const params = signedQueryParams.global;

      const pageRequests = pageDataList.map(async ({ pageHtml, pageNumber, pageHtmlWrapper }) => {
        if (!pageHtml) {
          const pageUrl = `${url}${objectKey}${pageNumber}.page${params}`;
          const backgroundFile = `bg${pageNumber.toString(16)}.png`;
          const backgroundUrl = `${url}${backgroundFile}${params}`;

          const pageResponse = await fetch(pageUrl);
          const pageResponseText = await pageResponse.text();

          pageHtml = pageResponseText.replace(backgroundFile, backgroundUrl);
        }

        return `${pageHtmlWrapper}${pageHtml}</div>`;
      });
      const pageContents = await Promise.all(pageRequests);

      const firstPage = document.querySelector('div[data-page-index="0"] .page-content');
      const firstImage = firstPage.querySelector('img.bi');
      const isHidden = firstPage.style.display == 'none';
      if (isHidden) {
        firstPage.style.display = 'block';
      }

      const scaleX = firstImage.naturalWidth / firstImage.offsetWidth;
      const scaleY = firstImage.naturalHeight / firstImage.offsetHeight;
      if (isHidden) {
        firstPage.style.display = 'none';
      }

      const documentContent = `
<div class="p2hv" style="transform:scale(${scaleX},${scaleY});transform-origin:top left;">
  <div id="page-container">${pageContents.join('')}</div>
</div>
`;
      return {
        title: seoData.originalTitle,
        content: documentContent,
        width: firstImage.naturalWidth,
        height: firstImage.naturalHeight,
      };
    },
  },
  // Scribd
  {
    domainNames: ['scribd.com'],
    buttonContainerSelector: '._12sL1I',
    buttonSelector: '.ButtonCore-module_wrapper_MkTb9s',
    fetchDocument: async () => {
      const { pages, firstVisiblePage } = window.docManager;

      const pageRequests = Object.values(pages).map(async pageData => {
        const { contentUrl, containerElem, origWidth, origHeight } = pageData;

        const pageResponse = await fetch(contentUrl);
        const pageResponseText = await pageResponse.text();

        const pageEscapedContent = pageResponseText.replace(/^[^(]*\((.*)\);?$/, '$1');
        const pageContent = JSON.parse(pageEscapedContent)[0].replace(
          /orig="http:\/\/html\.scribd\.com/g,
          'style="display: block;" src="https://html.scribdassets.com'
        );

        const pageContainer = containerElem.cloneNode();
        pageContainer.innerHTML = pageContent;
        pageContainer.style.width = `${origWidth}px`;
        pageContainer.style.height = `${origHeight}px`;

        return pageContainer.outerHTML;
      });

      const pageContents = await Promise.all(pageRequests);
      const documentContent = pageContents.join('');

      const hydrationTag = document.querySelector('script[data-hypernova-key="doc_page"]');
      const { wordDocument } = JSON.parse(hydrationTag.textContent.replace(/<!--|-->/g, ''));

      return {
        title: wordDocument.title,
        content: documentContent,
        width: firstVisiblePage.origWidth,
        height: firstVisiblePage.origHeight,
      };
    },
  },
];

const domainName = location.hostname.split('.').slice(-2).join('.');
const documentSource = DOCUMENT_SOURCES.find(source => source.domainNames.includes(domainName));

async function downloadDocument() {
  if (!document.getElementById(DOCUMENT_CONTAINER_ID)) {
    const documentInfo = await documentSource.fetchDocument();

    const styleElement = document.createElement('style');
    styleElement.textContent = `
#${DOCUMENT_CONTAINER_ID} {
  display: none;
}

@page {
  margin: 0;
  size: ${documentInfo.width}px ${documentInfo.height}px;
}

@media print {
  body > *:not(#${DOCUMENT_CONTAINER_ID}) {
    display: none;
  }

  #${DOCUMENT_CONTAINER_ID} {
    display: block;
  }

  #${DOCUMENT_CONTAINER_ID}, #${DOCUMENT_CONTAINER_ID} * {
    box-shadow: none;
    page-break-after: always;
    break-after: always;
    border: none;
  }
}
`;
    document.head.append(styleElement);

    const documentContainer = document.createElement('div');
    documentContainer.id = DOCUMENT_CONTAINER_ID;
    documentContainer.innerHTML = documentInfo.content;
    document.body.append(documentContainer);

    const images = Array.from(documentContainer.querySelectorAll('img'));
    const imagePromises = images.map(image => new Promise(resolve => {
      if (image.complete) {
        resolve();
        return;
      }
      image.onload = image.onerror = resolve;
    }));

    await Promise.all(imagePromises);
    await document.fonts?.ready;
    await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));
  }

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
  downloadButton.textContent = 'Download as PDF';
  downloadButton.disabled = false;
  downloadButton.style.pointerEvents = 'auto';
  downloadButton.style.cursor = 'pointer';
  downloadButton.onclick = downloadDocument;

  buttonContainer.prepend(downloadButton);
}

window.addEventListener('DOMContentLoaded', () => {
  if (!documentSource) {
    return;
  }

  const domObserver = new MutationObserver(createDownloadButton);
  domObserver.observe(document.body, { childList: true, subtree: true });
});

