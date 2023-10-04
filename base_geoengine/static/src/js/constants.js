/** @odoo-module **/

export const CUSTOM_LAYERS = [
    {
        layerName: 'satellite',
        layerURL: 'https://api.mapbox.com/styles/v1/mapbox/satellite-streets-v12/tiles/256/{z}/{x}/{y}?access_token=',
        image: "base_geoengine/static/src/images/satellite_view.png"
    },
    {
        layerName: 'street',
        layerURL: 'https://api.mapbox.com/styles/v1/mapbox/streets-v12/tiles/256/{z}/{x}/{y}?access_token=',
        image: "base_geoengine/static/src/images/street_view.png"
    },
    {
        layerName: 'outdoors',
        layerURL: 'https://api.mapbox.com/styles/v1/mapbox/outdoors-v12/tiles/256/{z}/{x}/{y}?access_token=',
        image: "base_geoengine/static/src/images/outdoor_view.png"
    }
]
export const FEATURE_OPACITY = 0.2;
export  const POLYGON_TYPES = [
    {
        name: "Property boundary",
        color: "#000000"
    },
    {
        name: "Field",
        color: "#ff0000"
    },
    {
        name: "Animal",
        color: "#00ff00"
    },
    {
        name: "Bed",
        color: "#F1B4BB"
    },
    {
        name: "Irrigation",
        color: "#ffff00"
    },
    {
        name: "Trial",
        color: "#00ffff"
    },
    {
        name: "Buffer",
        color: "#ff00ff"
    },
    {
        name: "Storage",
        color: "#ff8000"
    },
    {
        name: "Building",
        color: "#8000ff"
    },
    {
        name: "Other",
        color: "#808080"
    }
];
