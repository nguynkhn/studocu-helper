chrome.cookies.onChanged.addListener(({ cookie, removed }) => {
  // remove tracker cookie
  // code borrowed from this: https://github.com/GoogleChrome/chrome-extensions-samples/blob/c4393862e164d74d1b6112ced19f2a2bbe26506c/api-samples/cookies/cookie-clearer/popup.js#L75
  if (cookie.name == 'sd_docs' && !removed) {
    const protocol = cookie.secure ? 'https:' : 'http:';
    const cookieUrl = `${protocol}//${cookie.domain}${cookie.path}`;
    const details = { url: cookieUrl, name: cookie.name, storeId: cookie.storeId };
    chrome.cookies.remove(details);
  }
});

