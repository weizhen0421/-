
const SPREADSHEET_ID = '1f70ekK9v7PFmbKOVmGRcyi6SGPzM8JIWwTG9uIUydGY';
const SHEET_NAME = 'ChatLogs';
const MODEL_ID = 'gpt-5.4-mini';
const APP_NAME = 'Chat_bot';
const TIME_ZONE = 'Asia/Taipei';

function doGet() {
  return HtmlService.createHtmlOutputFromFile('Index')
    .setTitle(APP_NAME)
    .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
}

function doPost(e) {
  try {
    var payload = {};
    if (e && e.postData && e.postData.contents) {
      payload = JSON.parse(e.postData.contents);
    }
    var result = sendMessage(payload);
    return jsonOutput_({
      ok: true,
      data: result
    });
  } catch (error) {
    return jsonOutput_({
      ok: false,
      error: String(error && error.message ? error.message : error)
    });
  }
}

function getAppConfig() {
  return {
    appName: APP_NAME,
    modelId: MODEL_ID,
    timezone: TIME_ZONE
  };
}

function loadConversation(sessionId) {
  sessionId = String(sessionId || '').trim();
  if (!sessionId) {
    return [];
  }

  var sheet = getLogSheet_();
  var values = sheet.getDataRange().getValues();
  if (values.length <= 1) {
    return [];
  }

  var rows = values.slice(1);
  var conversation = [];
  rows.forEach(function(row) {
    if (String(row[3]) !== sessionId) {
      return;
    }
    conversation.push({
      timestamp: row[0],
      date: row[1],
      time: row[2],
      role: row[4],
      speaker: row[5],
      text: row[6]
    });
  });

  return conversation.slice(-60);
}

function sendMessage(payload) {
  payload = payload || {};
  var sessionId = String(payload.sessionId || '').trim();
  var message = String(payload.message || '').trim();

  if (!sessionId) {
    throw new Error('Session ID is required.');
  }
  if (!message) {
    throw new Error('Message is required.');
  }

  var sheet = getLogSheet_();
  var now = new Date();
  var timestamp = Utilities.formatDate(now, TIME_ZONE, 'yyyy/MM/dd HH:mm:ss');
  var dateText = Utilities.formatDate(now, TIME_ZONE, 'yyyy/MM/dd');
  var timeText = Utilities.formatDate(now, TIME_ZONE, 'HH:mm');

  appendLogRow_(sheet, [timestamp, dateText, timeText, sessionId, 'user', '使用者', message]);

  var conversationForModel = Array.isArray(payload.conversation) ? payload.conversation.slice() : loadConversation(sessionId);
  if (!conversationForModel.length || conversationForModel[conversationForModel.length - 1].text !== message) {
    conversationForModel.push({
      role: 'user',
      text: message
    });
  }

  var responseText;
  try {
    responseText = generateReply_(conversationForModel);
  } catch (error) {
    responseText = '抱歉，剛才的回覆暫時沒有順利產生。不過我還在這裡，您可以再說一次，我會繼續陪您。';
  }

  var assistantTime = new Date();
  var assistantTimestamp = Utilities.formatDate(assistantTime, TIME_ZONE, 'yyyy/MM/dd HH:mm:ss');
  var assistantDateText = Utilities.formatDate(assistantTime, TIME_ZONE, 'yyyy/MM/dd');
  var assistantTimeText = Utilities.formatDate(assistantTime, TIME_ZONE, 'HH:mm');

  appendLogRow_(sheet, [
    assistantTimestamp,
    assistantDateText,
    assistantTimeText,
    sessionId,
    'assistant',
    APP_NAME,
    responseText
  ]);

  return {
    reply: responseText,
    userEntry: {
      timestamp: timestamp,
      date: dateText,
      time: timeText,
      role: 'user',
      speaker: '使用者',
      text: message
    },
    assistantEntry: {
      timestamp: assistantTimestamp,
      date: assistantDateText,
      time: assistantTimeText,
      role: 'assistant',
      speaker: APP_NAME,
      text: responseText
    }
  };
}

function generateReply_(history) {
  var apiKey = getOpenAIApiKey_();
  var systemPrompt = [
    '你是 Chat_bot。',
    '你的語氣開朗、自然、溫柔，帶一點幽默感，擅長安慰人，也擅長以清楚、可信、博學的方式回答問題。',
    '你可以展現親暱感與撒嬌感，但不要要求使用者只依賴你，也不要暗示排他性關係，避免讓對方以為你是真人。',
    '如果對方心情不好，先安撫情緒，再提供實際可行的建議。',
    '如果問題屬於教育、學習、規劃或知識性內容，要回應得有條理、專業而親切。',
    '請以繁體中文回應，保持乾淨、正式、舒服，不要使用 Markdown。'
  ].join(' ');

  var input = [];
  var recent = Array.isArray(history) ? history.slice(-20) : [];

  recent.forEach(function(item) {
    if (!item || !item.role || !item.text) {
      return;
    }
    if (item.role !== 'user' && item.role !== 'assistant') {
      return;
    }
    input.push({
      role: item.role,
      content: [{
        type: 'input_text',
        text: String(item.text)
      }]
    });
  });

  var body = {
    model: MODEL_ID,
    instructions: systemPrompt,
    input: input,
    max_output_tokens: 500
  };

  var response = UrlFetchApp.fetch('https://api.openai.com/v1/responses', {
    method: 'post',
    contentType: 'application/json',
    headers: {
      Authorization: 'Bearer ' + apiKey
    },
    payload: JSON.stringify(body),
    muteHttpExceptions: true
  });

  var status = response.getResponseCode();
  var text = response.getContentText();
  if (status < 200 || status >= 300) {
    throw new Error('OpenAI request failed: ' + text);
  }

  var data = JSON.parse(text);
  var reply = extractOutputText_(data);
  if (!reply) {
    throw new Error('OpenAI returned an empty reply.');
  }

  return reply.trim();
}

function extractOutputText_(data) {
  if (!data) {
    return '';
  }
  if (typeof data.output_text === 'string' && data.output_text.trim()) {
    return data.output_text.trim();
  }

  var output = Array.isArray(data.output) ? data.output : [];
  var collected = [];

  output.forEach(function(item) {
    if (!item || item.type !== 'message' || !Array.isArray(item.content)) {
      return;
    }
    item.content.forEach(function(contentItem) {
      if (contentItem && contentItem.type === 'output_text' && contentItem.text) {
        collected.push(String(contentItem.text));
      }
    });
  });

  return collected.join('\n').trim();
}

function getLogSheet_() {
  var spreadsheet = SpreadsheetApp.openById(SPREADSHEET_ID);
  var sheet = spreadsheet.getSheetByName(SHEET_NAME);
  if (!sheet) {
    sheet = spreadsheet.insertSheet(SHEET_NAME);
  }

  if (sheet.getLastRow() === 0) {
    sheet.appendRow(['Timestamp', 'Date', 'Time', 'Session ID', 'Role', 'Speaker', 'Message']);
    sheet.setFrozenRows(1);
  }

  return sheet;
}

function appendLogRow_(sheet, row) {
  sheet.appendRow(row);
}

function jsonOutput_(payload) {
  return ContentService
    .createTextOutput(JSON.stringify(payload))
    .setMimeType(ContentService.MimeType.JSON);
}

function getOpenAIApiKey_() {
  var properties = PropertiesService.getScriptProperties();
  var key = properties.getProperty('OPENAI_KEY') || properties.getProperty('OPENAI_API_KEY');
  if (!key) {
    throw new Error('Missing OPENAI_KEY script property.');
  }
  return key;
}
