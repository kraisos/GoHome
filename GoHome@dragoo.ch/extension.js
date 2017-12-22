const St = imports.gi.St;
const Main = imports.ui.main;
const Soup = imports.gi.Soup;
const Lang = imports.lang;
const Mainloop = imports.mainloop;
const Clutter = imports.gi.Clutter;
const PanelMenu = imports.ui.panelMenu;
const PopupMenu   = imports.ui.popupMenu;
//----------------------------------------------------------------------------
/*const PopupTeaMenuItem = new Lang.Class({
    Name: 'PopupTeaMenuItem',
    Extends: PopupMenu.PopupBaseMenuItem,

    _init: function (sTeaname, nBrewtime, params) {
        this.parent(params);

        this.tealabel  = new St.Label({ text: sTeaname });
        this.timelabel = new St.Label({ text: Utils.formatTime(nBrewtime) });

        if (this.actor instanceof St.BoxLayout) {
            // will be used for gnome-shell 3.10 and possibly above where this.actor is BoxLayout
            this.actor.add(this.tealabel,  { expand: true });
            this.actor.add(this.timelabel);
        } else {
            this.addActor(this.tealabel,  {expand: true });
            this.addActor(this.timelabel, {expand: false });
        }
    }
});*/
//----------------------------------------------------------------------------

const TW_URL = 'http://transport.opendata.ch/v1/connections'

let _httpSession;
let _refreshTimeStamp = 60;
let _params = {
 from: 'Charmettes', //Le lieu de déart
 to: 'Fribourg', //Le lieu d'arrivée
 limit: '6' //Le nombre de correspondances (permet de faire moins de refresh plus c'est haut)
};
let _busList;
const TransferWiseIndicator = new Lang.Class({
  Name: 'TransferWiseIndicator',
  Extends: PanelMenu.Button,

  _init: function () {
    global.log("Init Class");
    this.parent(0.0, "Transfer Wise Indicator", false);
    this.buttonText = new St.Label({
      text: _("Getting data..."),
      y_align: Clutter.ActorAlign.CENTER
    });
    this.actor.add_actor(this.buttonText);

    this._refresh();
    this._createMenu();
  },
  _createMenu : function() {

      /***************************************/
      _busList = new PopupMenu.PopupMenuSection();
      /***************************************/

      /***************************************/
      let stationsSection = new PopupMenu.PopupMenuSection();
      let departureStation = new St.Entry({ style_class: 'station-entry', track_hover: true, hint_text: _("Station de départ") });
      let arrivalStation = new St.Entry({ style_class: 'station-entry',track_hover: true, hint_text: _("Station d'arrivée") });
      departureStation.get_clutter_text().connect("key-press-event", Lang.bind(this, this._updateDepartureStation));
      arrivalStation.get_clutter_text().connect("key-press-event", Lang.bind(this, this._updateArrivalStation));

      stationsSection.box.add(departureStation);
      stationsSection.box.add(arrivalStation);
      stationsSection.actor.set_style("padding: 0px 18px;")
      /***************************************/

      /***************************************/
      let settingsSection = new PopupMenu.PopupMenuSection();
      let settingsItem = new PopupMenu.PopupMenuItem(_("Show settings")); //, 'gtk-preferences');
      settingsItem.connect('activate', Lang.bind(this, this._showSettings));
      settingsSection.addMenuItem(settingsItem);
      /***************************************/

      /*******************/
      //this.menu.addMenuItem(new PopupMenu.PopupSeparatorMenuItem());
      this.menu.addMenuItem(_busList);
      this.menu.addMenuItem(new PopupMenu.PopupSeparatorMenuItem());
      this.menu.addMenuItem(stationsSection);
      this.menu.addMenuItem(new PopupMenu.PopupSeparatorMenuItem());
      this.menu.addMenuItem(settingsSection);
  },
  _updateArrivalStation: function (text, event) {
    if (event.get_key_symbol() == Clutter.KEY_Enter || event.get_key_symbol() == Clutter.KEY_Return) {
      let station = text.get_text();
      _params.to = station;
      global.log("Update Arrival Station: " + station);
      this._removeTimeout();
      this._refresh();
    }
  },
  _updateDepartureStation: function (text, event) {
    if (event.get_key_symbol() == Clutter.KEY_Enter || event.get_key_symbol() == Clutter.KEY_Return) {
      let station = text.get_text();
      _params.from = station;
      global.log("Update Departure Station: " + station);
      this._removeTimeout();
      this._refresh();
    }
  },
  _showSettings: function () {
      global.log("Show Settings");
  },
  _refresh: function () {
    global.log("------------------------- Debut refresh -------------------------");
    this._removeTimeout();
    this._loadData(this._refreshUI);
    global.log("------------------------- fin refresh -------------------------");
    return true;
  },
  _loadData: function () {
    global.log("------------------------- debut loadData -------------------------");
    _httpSession = new Soup.Session();
    let message = Soup.form_request_new_from_hash('GET', TW_URL, _params);
    global.log("fragment: " + message.uri.fragment);
    global.log("host: "     + message.uri.host);
    global.log("password: " + message.uri.password);
    global.log("path: "     + message.uri.path);
    global.log("query: "    + message.uri.query);
    global.log("scheme: "   + message.uri.scheme);
    global.log("user: "     + message.uri.user);
    _httpSession.queue_message(message, Lang.bind(this, function (_httpSession, message) {
          global.log("------------------------- debut queue_message -------------------------");
          if (message.status_code !== 200){
            global.log("Bad return status_code");
            return;
          }
          global.log("Good return status_code");
          let json = JSON.parse(message.response_body.data);
          this._refreshUI(json);
          this._refreshMenu(json);
          this._calculateNextRefresh(json);
          global.log("------------------------- fin queue_message -------------------------");
        }
      )
    );
    global.log("------------------------- fin loadData -------------------------");
  },
  _calculateNextRefresh: function(data){
    let actualTimestamp = Math.floor(Date.now()/1000);
    global.log("actualTimestamp:                 " + actualTimestamp);
    let i = 0;
    do {
      _refreshTimestamp =  data.connections[i].from.departureTimestamp;
      global.log(i + " checking for refreshTimestamp: " + this.refreshTimestamp);
      i++;
      if(i>=6){
        _refreshTimestamp = 60;
        break;
      }
    } while (_refreshTimestamp <= actualTimestamp);
    waitingTime = _refreshTimestamp - actualTimestamp;
    global.log("waitingTime: "      + waitingTime);
    let waitingTimeMarge = 0;
    this._timeout = Mainloop.timeout_add_seconds(waitingTime + waitingTimeMarge, Lang.bind(this, this._refresh));
    global.log("refreshTimestamp set:            " + _refreshTimestamp);
  },
  _refreshUI: function (data) {
    global.log("------------------------- debut refreshUI -------------------------");
    let i = 0;
    let busTimeStamp = 0;
    let actualTimestamp = Math.floor(Date.now()/1000);
    do {
      busTimeStamp = data.connections[i].from.departureTimestamp;
      global.log(i + " checking for next bus: " + txt);
      if(i>=6){
        this.buttonText.set_text("unable to get next bus");
        return;
      }
      i++;
    } while (busTimeStamp <= actualTimestamp);
    let date = new Date(busTimeStamp*1000);
    let txt = data.connections[i-1].from.station.name+" ➔ "+data.connections[i-1].to.station.name+" "+date.getHours()+":"+(date.getMinutes() <= 9 ? "0" : "")+date.getMinutes();
    this.buttonText.set_text(txt);
    global.log("------------------------- fin refreshUI -------------------------");
  },
  _refreshMenu: function (data) {
      global.log("refresh Menu");
      _busList.removeAll();
      let actualTimestamp = Math.floor(Date.now()/1000);
      for (let i = 0; i < 6; i++) {
        let departure = data.connections[i].from.departureTimestamp;
        let date = new Date(departure*1000);
        let txt = data.connections[i].from.station.name+" ➔ "+data.connections[i].to.station.name+" "+date.getHours()+":"+(date.getMinutes() <= 9 ? "0" : "")+date.getMinutes();
        let menuItem = new PopupMenu.PopupMenuItem(txt);
        if(departure <= actualTimestamp){menuItem.actor.set_style("color: red;");}
        _busList.addMenuItem(menuItem);
      }
  },
  _removeTimeout: function () {
    if (this._timeout) {
      Mainloop.source_remove(this._timeout);
      this._timeout = null;
    }
  },
  stop: function () {
    if (_httpSession !== undefined)
      _httpSession.abort();
    _httpSession = undefined;

    if (this._timeout)
      Mainloop.source_remove(this._timeout);
    this._timeout = undefined;

    this.menu.removeAll();
  }
});

let twMenu;

function init() {
  global.log("Init");
}

function enable() {
	twMenu = new TransferWiseIndicator;
	Main.panel.addToStatusArea('tw-indicator', twMenu, 1, 'center');
}

function disable() {
	twMenu.stop();
	twMenu.destroy();
}
