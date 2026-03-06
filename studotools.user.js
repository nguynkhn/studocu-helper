// ==UserScript==
// @name         Studotools
// @namespace    http://github.com/nguynkhn/studotools
// @version      1.1
// @description  Userscript for document downloading
// @author       nguynkhn
// @match        *://*.studeersnel.nl/nl/document/*/*
// @match        *://*.studocu.com/en/document/*/*
// @match        *://*.studocu.id/id/document/*/*
// @match        *://*.studocu.vn/vn/document/*/*
// @match        *://*.scribd.com/document/*/*
// @match        *://*.scribd.com/presentation/*/*
// @icon         https://cdn-icons-png.flaticon.com/512/14964/14964744.png
// @grant        GM_cookie
// @grant        GM_addStyle
// @grant        unsafeWindow
// ==/UserScript==

(function() {
    'use strict';

    const DOWNLOAD_BUTTON_CLASS = 'studotools-download-btn';
    const PRINTING_CLASS = 'studotools-printing';
    let downloadButton;
    const sources = [
        // Studocu
        {
            urlRegex: /(^|\.)((studeersnel\.nl)|(studocu\.(com|id|vn)))$/i,
            buttonContainerClass: '.TopbarActions_secondary-actions-wrapper__4u75_',
            buttonClass: '.Button_button__88E9y',
            blockCookie: 'sd_docs',
            fetchDocument: async () => {
                const { documentAccess, pageDataList } = unsafeWindow.__NEXT_DATA__.props.pageProps;
                const { url, objectKey, signedQueryParams } = documentAccess;
                const params = signedQueryParams.global;

                const pageContent = await Promise.all(pageDataList.map(async pageData => {
                    const { pageNumber, pageHtmlWrapper } = pageData;
                    const pageUrl = `${url}${objectKey}${pageNumber}.page${params}`;

                    const backgroundFile = `bg${pageNumber.toString(16)}.png`;
                    const backgroundUrl = `${url}${backgroundFile}${params}`;

                    const pageResponse = await fetch(pageUrl);
                    const pageText = await pageResponse.text();
                    const pageContent = pageText.replaceAll(backgroundFile, backgroundUrl);

                    return `${pageHtmlWrapper}${pageContent}</div>`;
                }));

                const firstImageElement = document.querySelector('div[data-page-index="0"] img');
                const scale = firstImageElement.naturalWidth / firstImageElement.clientWidth;

                return `
<div class="p2hv" style="transform:scale(${scale});transform-origin:top left;">
    <div id="page-container">${pageContent.join('')}</div>
</div>
`;
            },
        },
        // Scribd
        {
            urlRegex: /(^|\.)scribd\.com$/i,
            buttonContainerClass: '._12sL1I',
            buttonClass: '.ButtonCore-module_wrapper_MkTb9s',
            fetchDocument: async () => {
                const { pages } = unsafeWindow.docManager;

                const pageContent = await Promise.all(Object.entries(pages).map(async ([ pageNo, pageData ]) => {
                    const { contentUrl, containerElem, origWidth, origHeight } = pageData;

                    const pageResponse = await fetch(contentUrl);
                    const pageCode = await pageResponse.text();
                    const pageEscapedContent = pageCode.replace(`window.page${pageNo}_callback([`, '')
                        .replace(/]\);\s*$/, '');
                    const pageContent = JSON.parse(pageEscapedContent)
                        .replace(/orig="http:\/\/html\.scribd\.com/g, 'style="display: block;" src="https://html.scribdassets.com');

                    const newContainer = containerElem.cloneNode();
                    newContainer.innerHTML = pageContent;
                    newContainer.style.width = `${origWidth}px`;
                    newContainer.style.height = `${origHeight}px`;

                    return newContainer.outerHTML;
                }));

                return pageContent.join('');
            },
        },
    ];
    const source = sources.find(source => source.urlRegex.test(location.hostname));

    async function downloadDocument() {
        downloadButton.textContent = 'Downloading...';

        if (!document.querySelector(`.${PRINTING_CLASS}`)) {
            const documentContent = await source.fetchDocument();

            const printingElement = document.createElement('div');
            printingElement.classList.add(PRINTING_CLASS);
            printingElement.innerHTML = documentContent;
            document.body.appendChild(printingElement);

            const imageElements = Array.from(printingElement.querySelectorAll('img'));
            await Promise.all(imageElements.map(imageElement => new Promise(resolve => {
                if (imageElement.complete) {
                    resolve();
                    return;
                }

                imageElement.addEventListener('load', resolve);
                imageElement.addEventListener('error', resolve);
            })));

            await document.fonts?.ready;
            await new Promise(r => requestAnimationFrame(r));
        }

        window.print();
    }

    function createDownloadButton() {
        const buttonContainer = document.querySelector(source.buttonContainerClass);
        if (!buttonContainer || buttonContainer.querySelector(`.${DOWNLOAD_BUTTON_CLASS}`)) {
            return;
        }

        if (!downloadButton) {
            downloadButton = buttonContainer.querySelector(source.buttonClass)?.cloneNode();
            if (!downloadButton) {
                return;
            }

            downloadButton.classList.add(DOWNLOAD_BUTTON_CLASS);
            downloadButton.textContent = 'Download as PDF';
            downloadButton.addEventListener('click', downloadDocument);
            downloadButton.disabled = false;
            downloadButton.style.pointerEvents = 'auto';
            downloadButton.style.cursor = 'pointer';
        }

        buttonContainer.prepend(downloadButton);
    }

    window.addEventListener('load', () => {
        if (source.blockCookie) {
            GM_cookie.delete({ name: source.blockCookie });
        }

        GM_addStyle(`
.${PRINTING_CLASS} {
    display: none;
}

@media print {
    @page {
        margin: 0;
        size: auto;
    }
    .${PRINTING_CLASS} {
        display: block !important;
        position: absolute;
        top: 0;
        left: 0;
    }
    .${PRINTING_CLASS}, .${PRINTING_CLASS} * {
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
`);
        const observer = new MutationObserver(createDownloadButton);
        observer.observe(document.body, { childList: true, subtree: true });
        window.addEventListener('afterprint', () => { downloadButton.textContent = 'Download as PDF' });
    });
})();
