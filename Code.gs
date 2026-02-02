function doGet(e) {
  var template = HtmlService.createTemplateFromFile('index');
  
  // ส่งข้อมูลสำคัญไปให้หน้า HTML
  template.mode = e.parameter.mode || 'master';
  template.appUrl = ScriptApp.getService().getUrl(); // ดึง URL จริงของเว็บมาให้เลย
  
  return template.evaluate()
      .setTitle('Badminton Manager 🏸')
      .addMetaTag('viewport', 'width=device-width, initial-scale=1')
      .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
}

function include(filename) {
  return HtmlService.createHtmlOutputFromFile(filename).getContent();
}

function syncSaveState(jsonState) {
  PropertiesService.getScriptProperties().setProperty('LIVE_STATE', jsonState);
}

function syncLoadState() {
  return PropertiesService.getScriptProperties().getProperty('LIVE_STATE');
}