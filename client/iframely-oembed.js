(function(iframely) {

var httpLink = {};
(function(httpLink) {

const HT = '\t';
const SP = ' ';
const CR = '\r';
const NF = '\n';

const SPACES = [SP, HT, CR, NF];

const SEPARATORS = [
    '(', ')', '<', '>', '@', 
    ',', ';', ':', '\\', '"',
    '/', '[', ']', '?', '=',
    '{', '}', SP, HT
];

function skipSpaces(value, pos) {
    while (pos < value.length && SPACES.indexOf(value.charAt(pos)) >= 0) pos++;

    return pos;
}

function readToken(value, pos) {
    var start = pos;
    while (pos < value.length && SEPARATORS.indexOf(value.charAt(pos)) == -1) {
        pos++;
    }
    
    return value.substring(start, pos);
}

function readQuotedString(value, pos) {
    var ch;
    var start = pos;
    
    pos++;
    while (pos < value.length) {
        ch = value.charAt(pos);
        if (ch === '"') break;
        if (ch === '\\') pos++;
        pos++;
    }
    
    return value.substring(start, pos + 1);
}

function decodeQuotedString(value) { 
    value = value.substr(1, value.length - 2);
    var start = 0, p;
    var result = '';
    
    while((p = value.indexOf('\\', start)) != -1) {
        result += value.substring(start, p);
        start = p + 2;
    }
    
    result += value.substring(start);
    
    return result;
}

function readLinkParam(value, pos, link) {
    var pname = readToken(value, pos);
    pos = skipSpaces(value, pos + pname.length);
    if (value.charAt(pos) !== '=')
        throw new Error('Unexpected token: ' + pos);

    pos++;
    var isQuotedString = value.charAt(pos) === '"';
    var pvalue = isQuotedString? readQuotedString(value, pos): readToken(value, pos);
    pos += pvalue.length;
    
    link[pname] = isQuotedString? decodeQuotedString(pvalue): pvalue;
    
    return pos;
}

function readLink(value, pos, link) {
    if (value.charAt(pos) !== '<')
        throw new Error('Unexpected token: ' + pos);
    
    var p = value.indexOf('>', pos);
    if (p === -1) throw new Error('Unexpected token: ' + pos);

    link.href = value.substring(pos + 1, p);
    pos = skipSpaces(value, p + 1);
    
    while(pos < value.length && value.charAt(pos) === ';') {
        pos = skipSpaces(value, pos + 1);
        pos = readLinkParam(value, pos, link);
        pos = skipSpaces(value, pos);
    }
    
    return pos;
}

httpLink.parse = function(value) {
    var pos = 0;
    
    var links = [];
    var link;
    
    while (pos < value.length && (pos === 0 || value.charAt(pos) === ',' && pos++)) {
        link = {};
        pos = skipSpaces(value, pos);
        pos = readLink(value, pos, link);
        links.push(link);
        pos = skipSpaces(value, pos);
    }
    
    return links;
};

})(httpLink);

var twoStepsProvider_getOembed = function(url, options, callback) {
    if (typeof options == 'function') {
        callback = options;
        options = {};
    }
    
    iframely.getOembedLinks(url, function(err, links) {
        if (err) {
            callback(err);
            
        } else {
            links.sort();
            var oembedUrl = links[0].href;
            iframely.getOembedByProvider(oembedUrl, options, callback);
        }
    });
};

var serverProvider_getOembed = function(url, options, callback) {
    if (typeof options == 'function') {
        callback = options;
        options = {};
    }
    
    var params = [];
    params.push('url=' + encodeURIComponent(url));
    if (options.format) params.push('format=' + options.format);
    
    var serverEndpoint = options.serverEndpoint || 'http://iframe.ly/oembed/1';
    
    var oembedUrl = serverEndpoint + '?' + params.join('&');
    iframely.getOembedByProvider(oembedUrl, options, callback);
};

/**
 * Fetches oembed links for the given page url
 */
iframely.getOembedLinks = function(url, options, callback) {
    if (typeof options == 'function') {
        callback = options;
        options = {};
    }
    
    request('HEAD', url, function(error, req) {
        if (error) {
            callback(error);

        } else {
            var value = req.getResponseHeader('link');
            if (value) {
                try {
                    var links = httpLink.parse(value).filter(isOembed);
                    if (links.length > 0) {
                        callback(null, links);

                    } else {
                        callback({error: 'not-found'});
                    }

                } catch (e) {
                    callback(e);
                }

            } else {
                callback({error: 'not-found'});
            }
        }
    });
}

/**
 * Get oembed object for the given url
 */
iframely.getOembed = function(originalUrl, options, callback) {
    if (typeof options == 'function') {
        callback = options;
        options = {};
    }
    
    twoStepsProvider_getOembed(originalUrl, options, function(error, oembed) {
        if (error) {
            serverProvider_getOembed(originalUrl, options, callback);
            
        } else {
            callback(error, oembed);
        }
    });
};

/*
 * Get oembed by oembed url (not original page)
 */
iframely.getOembedByProvider = function(oembedUrl, options, callback) {
    if (typeof options == 'function') {
        callback = options;
        options = {};
    }
    
    if (options.maxwidth) oembedUrl += '&maxwidth=' + options.maxwidth;
    if (options.maxheight) oembedUrl += '&maxheight=' + options.maxheight;
    
    request('GET', oembedUrl, function(error, req, data) {
        if (error) {
            callback(error);
        
        } else {
            try {
                if (req.responseXML) {
                    data = xmlToOembed(req.responseXML);
                    
                } else {
                    data = JSON.parse(data);
                }

            } catch(e) {
                callback({error: true, reason: e.message});
                return;
            }

            callback(null, data);
        }
    });
};

var htmlProviders = {
        'rich': function(url, data) {
            return data.html;
        },
        'photo': function(url, data) {
            if (data.html)
                return data.html;
            return '<img src="' + data.url + '" width="' + data.width + '" height="' + data.height + '" alt="' +  + '">';
        },
        'link': function(url, data) {
            if (data.html)
                return data.html;
            return '<a href="' + url + '" target="_blank">' + data.title || url + '</a> '
        },
        'video': function(url, data) {
            return data.html;
        }
};

iframely.getOembedHtml = function(url, data) {
    return htmlProviders[data.type](url, data)
}

function xmlToOembed(xml) {
    var json = xmlToJson(xml);
    // TODO: validate structure?
    return json.oembed || undefined;
}

function xmlToJson(xml) {
    var obj = {};

    if (xml.hasChildNodes()) {
        for(var i = 0; i < xml.childNodes.length; i++) {
            var item = xml.childNodes.item(i);
            var nodeType = item.nodeType;
            var nodeName = item.nodeName;
            if (nodeType == 3 || nodeType  == 4) {
                obj = item.nodeValue;
            } else {
                obj[nodeName] = xmlToJson(item);
            }
        }
    }
    return obj;
}

function isOembed(link) {
    return link.type === 'application/json+oembed' || link.type === 'application/xml+oembed' || link.type === 'text/xml+oembed';
}

function request(method, url, callback) {
    var req = new XMLHttpRequest();
    req.open(method, url, true);
    req.onload = function() {
        if (req.status == 200) {
            callback(null, req, req.response);
        
        } else {
            callback({error: true, code: req.status});
        }
    };
    req.onerror = function(e) {
        callback({error: true});
    };
    req.send();
}

})(iframelyOembed = {});
