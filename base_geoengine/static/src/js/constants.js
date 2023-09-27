/** @odoo-module **/

export const HECTARE_FACTOR = 10_000;
export const CUSTOM_LAYERS = {
    satellite: 'https://api.mapbox.com/styles/v1/mapbox/satellite-streets-v12/tiles/256/{z}/{x}/{y}?access_token=',
    streets: 'https://api.mapbox.com/styles/v1/mapbox/streets-v12/tiles/256/{z}/{x}/{y}?access_token=',
    outdoors:  'https://api.mapbox.com/styles/v1/mapbox/outdoors-v12/tiles/256/{z}/{x}/{y}?access_token=',
}
export const ACTION_MODES = {
    DRAW: 'draw',
    EDIT: 'edit',
    DELETE : 'delete',
}
export const FEATURE_OPACITY = 0.3;