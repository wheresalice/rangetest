//////////////////////////////////////////////////////////////////////////////////////

document.getElementById('input-file').addEventListener('change', event => {
  const file = event.target.files[0];
  const reader = new FileReader();

  reader.onload = function(e) {
    const text = e.target.result;
    processCSV(text);
  };

  reader.readAsText(file);
});

//////////////////////////////////////////////////////////////////////////////////////

var nodes = {};
var map;
var bounds;

var baseMaps = {};
var overlayMaps = {};

let data;
let header;

let dayList = {};
let typeList = {};
let senderList = {};

function processCSV(text) {

  //todo, allow to add data to existing array!

  data = CSVToArray(text,',');
  header = data.shift();

  renderMap({});
}

function updateMap() {
  let filters = {};
  let select = document.getElementById('selectDays');
  if (select.options.length > 0) {
    filters['days'] = [];
    for(let q=0;q<select.options.length;q++) {
      if (select.options[q].selected)
        filters['days'].push(select.options[q].value);
    }
  }

  select = document.getElementById('selectTypes');
  if (select.options.length > 0) {
    filters['types'] = [];
    for(let q=0;q<select.options.length;q++) {
      if (select.options[q].selected)
        filters['types'].push(select.options[q].value);
    }
  }

  select = document.getElementById('selectSenders');
  if (select.options.length > 0) {
    filters['senders'] = [];
    for(let q=0;q<select.options.length;q++) {
      if (select.options[q].selected)
        filters['senders'].push(select.options[q].value);
    }
  }

  console.log(filters);
  renderMap(filters);
}

///////////////////

function renderMap(filters) {

	document.getElementById('map').style.display = 'inherit';
	document.getElementById('filter').style.display = 'inherit';

	if (map) {
		overlayMaps['Remote Nodes'].clearLayers();
		overlayMaps['Your Node Locations'].clearLayers();
		overlayMaps['Contacts'].clearLayers();

	} else {
		var mapOptions = {
			attributionControl:false //we add our own manually!
		};
		map = window.map = L.map('map', mapOptions).addControl(
			L.control.attribution({ position: 'bottomright', prefix: ''}) );

		setupBaseMaps();

		overlayMaps['Remote Nodes'] = L.layerGroup().addTo(map);
		overlayMaps['Your Node Locations'] = L.layerGroup().addTo(map);
		overlayMaps['Contacts'] = L.layerGroup().addTo(map);

		//should have alrady setup overlayMaps at this point too!
		L.control.layers(baseMaps,overlayMaps).addTo(map);
	}

///////////////////

	let bounds = L.latLngBounds();
	let done = 0;

	let setup = 0;
	if (Object.keys(dayList).length == 0)
		setup = 1;

	nodes = {}; //for now, clear this each time. later will want to deduplicate mutliple files
	
	data.forEach(function(line,index) {
		let values = {};
		line.forEach((v,i) => values[header[i]] = v);

		if (!values['from'])
			return; //usually am empty row at the end!

		///////////////////

		let slat = parseFloat(values['sender lat']);
		let slng = parseFloat(values['sender long']);
		let rlat = parseFloat(values['rx lat']);
		let rlng = parseFloat(values['rx long']);

		///////////////////

		let day = values['date'];
		let type = values['payload'];
		let sender = values['from']; //todo, convert to hex?

		if (type.indexOf('<') != 0) {
			if (type.indexOf('seq ') == 0) type = '<RANGETEST PING>';
			else type = "Text Message";
		}
		if (values['sender name'] && values['sender name'].length > 1)
			sender = values['sender name'];
		if (setup) {
			dayList[day] = (dayList[day])?(dayList[day]+1):1;
			typeList[type] = (typeList[type])?(typeList[type]+1):1;
			senderList[sender] = (senderList[sender])?(senderList[sender]+1):1;

		} else if (filters) {
			if (filters['days']    && filters['days'].length    &&    filters['days'].indexOf(day)    == -1) { return; }
			if (filters['types']   && filters['types'].length   &&   filters['types'].indexOf(type)   == -1) { return; }
			if (filters['senders'] && filters['senders'].length && filters['senders'].indexOf(sender) == -1) { return; }
		}

		///////////////////
		//Sender Node
		if (!isNaN(slat) && !isNaN(slng) && (slat!=0.0 || slng!=0.0)) { //either could be zero degrees! (but the module version gives 0,0 as location)
			let key = values['from']+','+slat.toFixed(6)+','+slng.toFixed(6); //it could be mobile and moving!
			if (nodes[key]) {
				//marker already exists, doesnt need adding again!
				if (values['sender name'] && !nodes[key]['sender name'])
					nodes[key]['sender name'] = values['sender name'];
				//todo update the title attached to the marker, now we know the name
			} else {
				nodes[key] = values; //??
				L.circleMarker([slat,slng], {
					radius: 6,
					color: '#0000ff', //todo, pick from a colour pallet?
					title:"Remote Node: " + values['sender name']+". At " + values['date'] + ' '+values['time']
				}).addTo(overlayMaps['Remote Nodes']).bindPopup(showTitlePopup);
				bounds.extend([slat,slng]);
				done++;
			}
		} else {
			//todo, plot a nearby point?
		}

		///////////////////
		//Receiver/Self Node
		if (!isNaN(rlat) && !isNaN(rlng) && (rlat!=0.0 || rlng!=0.0)) { //either could be zero degrees!
			let key = 'self,'+slat.toFixed(6)+','+slng.toFixed(6); //even your node may be mobile
			if (nodes[key]) {
				//marker already exists, doesnt need adding again!
			} else {
				nodes[key] = values; //??
				L.circleMarker([rlat,rlng], {
					radius: 6,
					color: '#ff0000',
					title:"Self. At " + values['date'] + ' '+values['time'] //todo - doesnt work with circleMarker!
				}).addTo(overlayMaps['Your Node Locations']).bindPopup(showTitlePopup);
				bounds.extend([rlat,rlng]);
				done++;
			}
		} else {
			//hmm? doesnt seem to ever be empty in test data. 
		}

		///////////////////
		//line joining the two

		if (!isNaN(slat) && !isNaN(slng) && (slat!=0.0 || slng!=0.0) && !isNaN(rlat) && !isNaN(rlng) && (rlat!=0.0 || rlng!=0.0)) {
			L.polyline([[slat,slng],[rlat,rlng]], {
				color: '#0000ff',
				weight: parseInt(values['hop limit'])+1,
				title: values['date'] + ' '+values['time']
			}).addTo(overlayMaps['Contacts']).bindPopup(showTitlePopup);
		}

		///////////////////
	});

///////////////////

        if (done) {
	   	map.fitBounds(bounds,{maxZoom:15});
	}

	if (setup) {
		let select = document.getElementById('selectDays');
		Object.keys(dayList).forEach(function(day) {
			let opt = document.createElement('option');
			opt.value = day
			opt.innerHTML = day + ' ('+dayList[day]+' packets)';
			select.appendChild(opt);
		});

		select = document.getElementById('selectTypes');
		Object.keys(typeList).forEach(function(type) {
			let opt = document.createElement('option');
			opt.value = type
			opt.text = type + ' ('+typeList[type]+' packets)';
			select.appendChild(opt);
		});

		select = document.getElementById('selectSenders');
		Object.keys(senderList).forEach(function(sender) {
			let opt = document.createElement('option');
			opt.value = sender
			opt.text = sender + ' ('+senderList[sender]+' packets)';
			select.appendChild(opt);
		});
	}

///////////////////
}

function setupBaseMaps() {

	var osmAttrib='Map data &copy; <a href="https://openstreetmap.org">OpenStreetMap</a> contributors';
	baseMaps['OpenStreetMap'] = new L.TileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',
		 {mapLetter: 'o', minZoom: 3, maxZoom: 18, attribution: osmAttrib});

	var topoAttribution = 'Data: &copy; <a href="https://openstreetmap.org/copyright">OpenStreetMap</a>-Contributors, <a href="http://viewfinderpanoramas.org">SRTM</a> | Map Style: &copy; (<a href="https://creativecommons.org/licenses/by-sa/3.0/">CC-BY-SA</a>) <a href="https://opentopomap.org">OpenTopoMap</a> - [<a href="https://www.geograph.org/leaflet/otm-legend.php">Key</a>]';
	baseMaps["OpenTopoMap"] = L.tileLayer('https://{s}.tile.opentopomap.org/{z}/{x}/{y}.png',
		{mapLetter: 'l', minZoom: 1, maxZoom: 17, detectRetina: false, attribution: topoAttribution});

	map.addLayer(baseMaps['OpenStreetMap']);
}

function showTitlePopup(input) {
	//input.options is the options from the original layer!
	return input.options.title;
}

//////////////////////////////////////////////////////////////////////////////////////
//From: https://gist.github.com/rakeden/508ca124fabe97eba6d5734f2efcea32

function CSVToArray(strData, strDelimiter) {
  // Check to see if the delimiter is defined. If not,
  // then default to comma.
  strDelimiter = (strDelimiter || ",");

  // Create a regular expression to parse the CSV values.
  var objPattern = new RegExp(
    (
      // Delimiters.
      "(\\" + strDelimiter + "|\\r?\\n|\\r|^)" +

      // Quoted fields.
      "(?:\"([^\"]*(?:\"\"[^\"]*)*)\"|" +

      // Standard fields.
      "([^\"\\" + strDelimiter + "\\r\\n]*))"
    ),
    "gi"
  );


  // Create an array to hold our data. Give the array
  // a default empty first row.
  var arrData = [[]];

  // Create an array to hold our individual pattern
  // matching groups.
  var arrMatches = null;


  // Keep looping over the regular expression matches
  // until we can no longer find a match.
  while (arrMatches = objPattern.exec(strData)) {

    // Get the delimiter that was found.
    var strMatchedDelimiter = arrMatches[1];

    // Check to see if the given delimiter has a length
    // (is not the start of string) and if it matches
    // field delimiter. If id does not, then we know
    // that this delimiter is a row delimiter.
    if (
      strMatchedDelimiter.length &&
      strMatchedDelimiter !== strDelimiter
    ) {

      // Since we have reached a new row of data,
      // add an empty row to our data array.
      arrData.push([]);

    }

    var strMatchedValue;

    // Now that we have our delimiter out of the way,
    // let's check to see which kind of value we
    // captured (quoted or unquoted).
    if (arrMatches[2]) {

      // We found a quoted value. When we capture
      // this value, unescape any double quotes.
      strMatchedValue = arrMatches[2].replace(
        new RegExp("\"\"", "g"),
        "\""
      );

    } else {

      // We found a non-quoted value.
      strMatchedValue = arrMatches[3];

    }


    // Now that we have our value string, let's add
    // it to the data array.
    arrData[arrData.length - 1].push(strMatchedValue);
  }

  // Return the parsed data.
  return (arrData);
}
