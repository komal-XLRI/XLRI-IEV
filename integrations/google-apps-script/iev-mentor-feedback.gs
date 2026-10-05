/**
 * IEV mentor feedback → IEV portal.
 *
 * Attach this script to a stage's Google Form (Extensions → Apps Script from
 * the FORM editor, not the Sheet). On every submission it forwards the whole
 * response, signed, to the IEV portal, which stores it against the exact
 * presentation named by the prefilled "IEV Presentation ID" question.
 *
 * Script Properties (Project Settings → Script properties):
 *   IEV_FEEDBACK_URL      https://<portal>/api/integrations/google-forms/feedback
 *   IEV_FEEDBACK_SECRET   the same value as FEEDBACK_WEBHOOK_SECRET on the server
 *   IEV_MENTOR_NAME_QUESTION  (optional) exact title of the "your name" question
 *
 * After setting them, run `setup` once from the editor and accept the
 * permissions. Nothing in this file needs editing per stage.
 */

var TOKEN_QUESTION_PREFIX = 'iev presentation id';
var QUEUE_KEY = 'IEV_RETRY_QUEUE';
var MAX_QUEUE = 500;

// ---------------------------------------------------------------- Setup ----

/** Installs the submit trigger and the retry trigger. Safe to run again. */
function setup() {
  var form = FormApp.getActiveForm();
  config_(); // fail early if the properties are missing

  ScriptApp.getProjectTriggers().forEach(function (trigger) {
    var fn = trigger.getHandlerFunction();
    if (fn === 'handleFormSubmit' || fn === 'retryQueued') ScriptApp.deleteTrigger(trigger);
  });

  ScriptApp.newTrigger('handleFormSubmit').forForm(form).onFormSubmit().create();
  ScriptApp.newTrigger('retryQueued').timeBased().everyMinutes(15).create();

  console.log('IEV feedback sync installed for form ' + form.getId());
}

// ------------------------------------------------------------- Triggers ----

/** Installable onFormSubmit trigger. */
function handleFormSubmit(e) {
  send_(e.response, true);
}

/** Time-driven retry of responses the portal could not take (network, 5xx, 429). */
function retryQueued() {
  var form = FormApp.getActiveForm();
  var queue = readQueue_();
  if (queue.length === 0) return;

  var remaining = [];
  queue.forEach(function (responseId) {
    try {
      var response = form.getResponse(responseId);
      if (!send_(response, false)) remaining.push(responseId);
    } catch (error) {
      console.error('IEV retry: could not load response ' + responseId + ': ' + error);
    }
  });
  writeQueue_(remaining);
}

// ------------------------------------------------------------ Utilities ----

/**
 * Re-sends every response on this form. Safe: the portal keys responses on
 * Google's response id, so a resend updates rather than duplicates. Use it
 * after fixing a configuration problem the sync log reported.
 */
function resyncAll() {
  var responses = FormApp.getActiveForm().getResponses();
  var ok = 0;
  responses.forEach(function (response) {
    if (send_(response, true)) ok += 1;
    Utilities.sleep(250);
  });
  console.log('IEV resync: ' + ok + ' of ' + responses.length + ' response(s) accepted or settled.');
}

/**
 * Checks the URL and the secret without storing anything: sends a response
 * with a presentation ID that cannot exist. 404/422 means the portal verified
 * the signature and answered; 401 means the secret does not match.
 */
function testConnection() {
  var form = FormApp.getActiveForm();
  var result = post_({
    version: 1,
    token: 'connection-test',
    formId: form.getId(),
    publishedUrl: form.getPublishedUrl(),
    responseId: 'connection-test-' + Date.now(),
    submittedAt: new Date().toISOString(),
    respondentEmail: null,
    mentorName: null,
    answers: [],
  });
  console.log('IEV test: HTTP ' + result.code + ' ' + result.text);
  if (result.code === 401) console.error('The secret does not match FEEDBACK_WEBHOOK_SECRET.');
  if (result.code === 422 || result.code === 404) console.log('Connection and signature OK.');
}

// ------------------------------------------------------------- Internals ----

/**
 * Sends one response. Returns true when the portal has settled it (stored, or
 * refused for a reason a retry cannot fix); false when it should be retried.
 */
function send_(response, queueOnFailure) {
  var payload = buildPayload_(response);
  var result;
  try {
    result = post_(payload);
  } catch (error) {
    console.error('IEV sync: network error for ' + payload.responseId + ': ' + error);
    if (queueOnFailure) enqueue_(payload.responseId);
    return false;
  }

  if (result.code >= 200 && result.code < 300) {
    console.log('IEV sync: ' + payload.responseId + ' → ' + result.text);
    return true;
  }

  if (result.code === 429 || result.code >= 500) {
    console.error('IEV sync: HTTP ' + result.code + ' for ' + payload.responseId + ', will retry. ' + result.text);
    if (queueOnFailure) enqueue_(payload.responseId);
    return false;
  }

  // 4xx: refused on purpose (pending presentation, wrong form, bad ID…).
  // Retrying cannot help; the reason is in the portal's sync log and here.
  console.error('IEV sync: refused ' + payload.responseId + ' (HTTP ' + result.code + '): ' + result.text);
  return true;
}

function buildPayload_(response) {
  var form = FormApp.getActiveForm();
  var mentorQuestion = (config_().mentorNameQuestion || '').trim().toLowerCase();

  var token = '';
  var mentorName = null;
  var answers = [];

  response.getItemResponses().forEach(function (itemResponse) {
    var item = itemResponse.getItem();
    var title = item.getTitle() || '(untitled question)';
    var lower = title.trim().toLowerCase();
    var answer = normalise_(itemResponse.getResponse());

    if (lower.indexOf(TOKEN_QUESTION_PREFIX) === 0) {
      token = typeof answer === 'string' ? answer.trim() : '';
    }

    var isNameQuestion = mentorQuestion
      ? lower === mentorQuestion
      : /\b(mentor|faculty|evaluator|your)\b.*\bname\b/.test(lower);
    if (!mentorName && isNameQuestion && typeof answer === 'string' && answer.trim()) {
      mentorName = answer.trim().slice(0, 200);
    }

    answers.push({ question: title.slice(0, 1000), type: String(item.getType()), answer: answer });
  });

  return {
    version: 1,
    token: token,
    formId: form.getId(),
    publishedUrl: form.getPublishedUrl(),
    responseId: response.getId(),
    submittedAt: response.getTimestamp().toISOString(),
    respondentEmail: response.getRespondentEmail() || null,
    mentorName: mentorName,
    answers: answers,
  };
}

/**
 * Text stays text; checkboxes become a list; grids become a list of rows.
 * Unanswered grid rows arrive as null and become empty values so every row of
 * a grid has the same shape.
 */
function normalise_(raw) {
  if (raw === null || raw === undefined) return '';
  if (!Array.isArray(raw)) return String(raw);

  var nested = raw.some(function (value) {
    return Array.isArray(value);
  });
  if (nested) {
    return raw.map(function (row) {
      if (row === null || row === undefined) return [];
      return (Array.isArray(row) ? row : [row]).map(function (v) {
        return v === null || v === undefined ? '' : String(v);
      });
    });
  }
  return raw.map(function (v) {
    return v === null || v === undefined ? '' : String(v);
  });
}

function post_(payload) {
  var cfg = config_();
  var body = JSON.stringify(payload);
  var timestamp = String(Math.floor(Date.now() / 1000));
  var signature = Utilities.computeHmacSha256Signature(
    timestamp + '.' + body,
    cfg.secret,
    Utilities.Charset.UTF_8
  )
    .map(function (b) {
      return ('0' + (b & 0xff).toString(16)).slice(-2);
    })
    .join('');

  var response = UrlFetchApp.fetch(cfg.url, {
    method: 'post',
    contentType: 'application/json; charset=utf-8',
    payload: body,
    headers: { 'X-IEV-Timestamp': timestamp, 'X-IEV-Signature': signature },
    muteHttpExceptions: true,
    followRedirects: false,
  });

  return { code: response.getResponseCode(), text: response.getContentText().slice(0, 500) };
}

function config_() {
  var props = PropertiesService.getScriptProperties();
  var url = props.getProperty('IEV_FEEDBACK_URL');
  var secret = props.getProperty('IEV_FEEDBACK_SECRET');
  if (!url || !secret) {
    throw new Error('Set IEV_FEEDBACK_URL and IEV_FEEDBACK_SECRET in Project Settings → Script properties.');
  }
  return { url: url, secret: secret, mentorNameQuestion: props.getProperty('IEV_MENTOR_NAME_QUESTION') };
}

function readQueue_() {
  var raw = PropertiesService.getScriptProperties().getProperty(QUEUE_KEY);
  try {
    return raw ? JSON.parse(raw) : [];
  } catch (error) {
    return [];
  }
}

function writeQueue_(queue) {
  PropertiesService.getScriptProperties().setProperty(QUEUE_KEY, JSON.stringify(queue.slice(-MAX_QUEUE)));
}

function enqueue_(responseId) {
  var lock = LockService.getScriptLock();
  lock.waitLock(10000);
  try {
    var queue = readQueue_();
    if (queue.indexOf(responseId) === -1) queue.push(responseId);
    writeQueue_(queue);
  } finally {
    lock.releaseLock();
  }
}
