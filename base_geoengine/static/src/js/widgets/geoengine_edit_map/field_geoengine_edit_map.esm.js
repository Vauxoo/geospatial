/** @odoo-module **/

/**
 * Copyright 2023 ACSONE SA/NV
 */

import {loadBundle} from "@web/core/assets";
import { session } from "@web/session";
import {registry} from "@web/core/registry";
import {useService} from "@web/core/utils/hooks";
import {standardFieldProps} from "@web/views/fields/standard_field_props";
import { 
    HECTARE_FACTOR, 
    CUSTOM_LAYERS,
    ACTION_MODES,
    FEATURE_OPACITY
} from "../../constants";

import {Component, onMounted, onRendered, onWillStart, useEffect} from "@odoo/owl";

export class FieldGeoEngineEditMap extends Component {
    setup() {
        // Allows you to have a unique id if you put the same field in the view several times
        this.id = `map_${Date.now()}`;
        this.orm = useService("orm");

        onWillStart(() =>
            Promise.all([
                loadBundle({
                    jsLibs: [
                        "/base_geoengine/static/lib/ol-7.2.2/ol.js",
                        "/base_geoengine/static/lib/chromajs-2.4.2/chroma.js",
                    ],
                }),
            ])
        );

        // Is executed when component is mounted.
        onMounted(async () => {
            const result = await this.orm.call(
                this.props.record.resModel,
                "get_edit_info_for_geo_column",
                [this.props.name]
            );
            this.projection = result.projection;
            this.defaultExtent = result.default_extent;
            this.defaultZoom = result.default_zoom;
            this.restrictedExtent = result.restricted_extent;
            this.srid = result.srid;
            this.mapBoxToken = session.map_box_token || "",
            this.createLayers();
            this.renderMap();
            this.setValue(this.props.value);
            this.actionMode = null;
        });

        useEffect(
            () => {
                if (!this.props.readonly && this.map !== undefined) {
                    this.setupControls();
                }
            },
            () => [this.props.value]
        );


        useEffect(
            () => {
                if(this.valuesTooltipElement) this.addValuesToTooltip();
            },
            () => [this.props.record.data]
        )

        // Is executed after component is rendered. When we use pagination.
        onRendered(() => {
            this.setValue(this.props.value);
        });
    }

    isDrawAllowed() {
        //*NOTE this will be used in the future
        // return this.actionMode === ACTION_MODES.DRAW
        // the land is a required field, so if it's not set we can't draw
        return this.props.record.data.city_id?.length > 0 ?? false
    }
    /**
     * Displays geo data on the map using the collection of features.
     */
    createVectorLayer() {
        this.features = new ol.Collection();
        this.source = new ol.source.Vector({features: this.features});
        const colorHex = this.props.color ? this.props.color : "#ee9900";
        const color = chroma(colorHex).alpha(FEATURE_OPACITY).css();
        const darkenColor = chroma(colorHex).darken(1).css();
        const fill = new ol.style.Fill({
            color,
        });
        const stroke = new ol.style.Stroke({
            color: darkenColor,
            width: 5,
        });
        return new ol.layer.Vector({
            source: this.source,
            style: new ol.style.Style({
                fill,
                stroke,
                image: new ol.style.Circle({
                    radius: 5,
                    fill,
                    stroke,
                }),
            }),
        });
    }

    /**
     * Call the method that creates the layer to display the geo data on the map.
     */
    // TODO: the selected layer will be a configuration parameter, right now the default layer is the OSM layer
    createLayers() {
        this.vectorLayer = this.createVectorLayer();
        this.osmLayer = new ol.layer.Tile({
            source: new ol.source.OSM(),
        });
        this.layer_list = [this.osmLayer]
        if (!!this.mapBoxToken) {
            const customLayers = Object.keys(CUSTOM_LAYERS).reduce((ac, key) => {
                ac[key] = new ol.layer.Tile({
                    source: new ol.source.XYZ({
                        url: `${CUSTOM_LAYERS[key]}${this.mapBoxToken}`,
                        visible: false
                    })
                })
                return ac
            }, {})
            const { satellite, streets, outdoors } = customLayers
            this.satelliteLayer = satellite
            this.streetLayer = streets
            this.outdoorsLayer = outdoors
            this.layer_list = [this.satelliteLayer, this.streetLayer, this.outdoorsLayer, this.osmLayer]
        }
    }

    /**
     * Allows you to centre the area defined for the user.
     * If there is an item to display.
     */
    updateMapZoom() {
        if (this.source) {
            var extent = this.source.getExtent();
            var infinite_extent = [Infinity, Infinity, -Infinity, -Infinity];
            if (extent !== infinite_extent) {
                var map_view = this.map.getView();
                if (map_view) {
                    map_view.fit(extent, {maxZoom: 14});
                }
            }
        }
    }

    /**
     * Allows you to centre the area defined for the user.
     * If there is not item to display.
     */
    updateMapEmpty() {
        var map_view = this.map.getView();
        if (map_view) {
            var extent = this.defaultExtent.replace(/\s/g, "").split(",");
            extent = extent.map((coord) => Number(coord));
            map_view.fit(extent, {maxZoom: this.defaultZoom || 5});
        }
    }

    /**
     * Based on the value passed in props, adds a new feature to the collection.
     * @param {*} value
     */
    setValue(value) {
        if (this.map) {
            /**
             * If the value to be displayed is equal to the one passed in props, do nothing
             * otherwise clear the map and display the new value.
             */
            if (this.displayValue == value) return;
            this.displayValue = value;
            var ft = new ol.Feature({
                geometry: new ol.format.GeoJSON().readGeometry(value),
                labelPoint: new ol.format.GeoJSON().readGeometry(value),
            });
            this.source.clear();
            this.source.addFeature(ft);

            if (value) {
                // if the value exists we create the values tooltip
                this.updateMapZoom();
                this.createValuesTooltip();
            } else {
                this.updateMapEmpty();
            }
        }
    }

    /**
     * This is triggered when the view changed. When we have finished drawing our geo data, or
     * when we clear the map.
     * @param {*} geometry
     */
    onUIChange(geometry) {
        var value = null;
        if (geometry) {
            value = this.format.writeGeometry(geometry);
        }
        this.props.update(value);
    }

    /**
     * Allow you to setup the trash button and the draw interaction.
     */
    setupControls() {
        if (!this.props.value) {
            // void (
            //     this.selectInteraction !== undefined &&
            //     this.map.removeInteraction(this.selectInteraction)
            // );
            // void (
            //     this.modifyInteraction !== undefined &&
            //     this.map.removeInteraction(this.modifyInteraction)
            // );
            this.drawInteraction = new ol.interaction.Draw({
                type: this.geoType,
                source: this.source,
            });
            this.map.addInteraction(this.drawInteraction);

            this.drawInteraction.on("drawstart", (e) => {
                this.createMeasureTooltip();
                // the event represents the sketch of the new feature being drawn.
                this.sketch = e.feature;
                this.tooltipCoord = e.coordinate;
                this.measureTooltipElement.textContent = "calculating...";
                this.listener = this.sketch.getGeometry().on("change", e => {
                    const geom = e.target;
                    this.tooltipCoord = geom.getInteriorPoint().getCoordinates();
                    this.measureTooltipOverlay.setPosition(this.tooltipCoord);
                })
            })
            
            this.drawInteraction.on("drawend", async (e) => {
                // remove the measureOverlay from the map
                this.map.removeOverlay(this.measureTooltipOverlay);
                const geom = e.feature.getGeometry();
                this.onUIChange(geom);
                /* we calculate the values:
                    - area => expressed in hectares
                    - latitude
                    - longitude
                */
                const values = this.calculateValues(geom);
                await this.saveValues(values)
                this.createValuesTooltip(values);
                this.valuesTooltipOverlay.setPosition(this.tooltipCoord)
                this.resetMeasureTooltip()
                ol.Observable.unByKey(this.listener);
            });

        } else {
            void (
                this.drawInteraction &&
                this.map.removeInteraction(this.drawInteraction)
            );
        }
        //TODO: edit mode is gonna be disabled for now
        //  else {
        //     void (
        //         this.drawInteraction !== undefined &&
        //         this.map.removeInteraction(this.drawInteraction)
        //     );
        //     this.selectInteraction = new ol.interaction.Select();
        //     this.modifyInteraction = new ol.interaction.Modify({
        //         features: this.selectInteraction.getFeatures(),
        //         deleteCondition: e => {
        //             return e.keyCode === 46
        //         }
        //     });
        //     this.map.addInteraction(this.selectInteraction);
        //     this.map.addInteraction(this.modifyInteraction);

        //     this.modifyInteraction.on("modifystart", () => {
        //         console.log("editing")
        //     })

        //     this.modifyInteraction.on("modifyend", (e) => {
        //         const geom = e.features.getArray()[0].getGeometry();
        //         const values = this.calculateValues(geom);
        //         this.addValuesToTooltip(values);
        //         e.features.getArray().forEach((item) => {
        //             this.onUIChange(item.getGeometry());
        //         });
        //     });
        // }

        // Trash Control
        const element = this.createTrashControl();

        this.clearmapControl = new ol.control.Control({element: element});

        this.map.addControl(this.clearmapControl);

        // FullScreen Control

        if (!!this.mapBoxToken) {
            const elementLayers = this.createLayerControl();

            this.layersControl = new ol.control.Control({element: elementLayers});

            this.map.addControl(this.layersControl);

            //*NOTE Draw Control this must be created in the draw mode
            // const drawButton = this.createDrawControl();
            // this.drawControl = new ol.control.Control({element: drawButton});
            // this.map.addControl(this.drawControl);
        }
    }

    /**
     * Create the div that will contain the buttons.
     */
    createControlsContainer() {
        this.controlsContainer = document.createElement("section");
        this.controlsContainer.className = "d-flex flex-direction-column ol-control ol-unselectable";
    }

    /**
     * Create the trash button that clears the map.
     * @returns the div in which the button is located.
     */
    createTrashControl() {
        const button = document.createElement("button");
        button.innerHTML = '<i class="fa fa-trash"/>';
        button.addEventListener("click", () => {
            this.source.clear();
            if(this.valuesTooltipOverlay) this.map.removeOverlay(this.valuesTooltipOverlay);
            this.onUIChange(null);
        });
        const element = document.createElement("div");
        element.className = "ol-clear ol-unselectable ol-control action-button";
        element.appendChild(button);
        return element;
    }

    /**
     * Create the button that allows you to draw on the map.
     * @returns the div in which the button is located.
     */
    createDrawControl() {
        const button = document.createElement("button");
        button.innerHTML = '<i class="fa fa-pencil"/>';
        button.addEventListener("click", () => {
            this.actionMode = ACTION_MODES.DRAW
        });
        const element = document.createElement("div");
        element.className = "ol-control ol-action-mode-draw action-button";
        element.appendChild(button);
        return element;
    }

    /**
     * Create the button that allows you to switch to full screen mode.
     * @returns the div in which the button is located.
     * 
     */
    // createFSControl() {
    //     const btn = document.createElement("button");
    //     btn.innerHTML = '<i class="fa fa-expand"/>';
    //     button.addEventListener("click", () => {
    //         const $map = document.querySelector(this.id);
    //         if(!document.fullscreenElement) {
    //             $map.requestFullscreen();
    //         }
    //     })
    // }


    /**
     * Create the buttons that change the map layers.
     * @returns the div in which the buttons are located.
     */
    createLayerControl() {
        const layers = [
            { name: 'Satellite', layer: this.satelliteLayer },
            { name: 'Street', layer: this.streetLayer },
            { name: 'Outdoors', layer: this.outdoorsLayer },
            { name: 'OSM', layer: this.osmLayer }
        ];
        const elementLayers = document.createElement("div");
        elementLayers.className = "ol-control ol-style-layer";

        layers.forEach(layer => {
            const button = document.createElement("button");
            button.id = layer.name;
            button.innerHTML = layer.name;
            button.addEventListener("click", () => {
                layers.forEach(l => l.layer.setVisible(l === layer));
            });
            elementLayers.appendChild(button);
        });

        return elementLayers;
    }

    /**
     * Displays the map in the div provided.
     */
    renderMap() {
        this.map = new ol.Map({
            target: this.id,
            layers: this.layer_list,
            view: new ol.View({
                center: [0, 0],
                zoom: 5,
            }),
        });
        this.map.addLayer(this.vectorLayer);
        this.format = new ol.format.GeoJSON({
            internalProjection: this.map.getView().getProjection(),
            externalProjection: "EPSG:" + this.srid,
        });
        if (!this.props.readonly) {
            this.setupControls();
        }
        this.map.on('pointermove', (e) => {
            const feature = this.map.forEachFeatureAtPixel(e.pixel, f => f);
            if (feature) {
                const geometry = feature.getGeometry();
                const { Polygon, MultiPolygon } = ol.geom
                if (geometry instanceof Polygon || geometry instanceof MultiPolygon) {
                    const extent = geometry.getExtent();
                    const center = ol.extent.getCenter(extent);
                    this.valuesTooltipOverlay.setPosition(center);
                    return;
                }
            }
            this.valuesTooltipOverlay.setPosition(undefined);
        });
    }
    /**
     * Creates a new measure tooltip
     */
    createMeasureTooltip() {
        if (this.measureTooltipElement) {
            this.measureTooltipElement.parentNode.removeChild(this.measureTooltipElement);
        }
        this.measureTooltipElement = document.createElement('div');
        this.measureTooltipElement.className = 'ol-tooltip ol-tooltip-measure';
        this.measureTooltipOverlay = new ol.Overlay({
            element: this.measureTooltipElement,
            offset: [15, 0],
            positioning: 'bottom-center',
            stopEvent: false,
            insertFirst: false,
        });
        this.map.addOverlay(this.measureTooltipOverlay);
    }
    /**
     * Resets the values of the measure tooltip element and the sketch, so that a new
     * tooltip can be created.
     * @returns {void}
     */
    resetMeasureTooltip() {
        // unset sketch
        this.sketch = null;
        this.measureTooltipElement = null;
        this.createMeasureTooltip();
    }
    /**
     * Calculates the area , the length and the latitude of the polygon.
     * @param {ol.sphere.Polygon} polygon The polygon.
     * @return {string} Formatted area.
     */
    calculateValues (polygon) {
        const area = ol.sphere.getArea(polygon) / HECTARE_FACTOR;
        /*
            arr[0] => longitude
            arr[1] => latitude
            arr[2] => altitude
        */
        const [longitude, latitude] = polygon.getInteriorPoints().getCoordinates().flat(1)
        return {
            area,
            longitude,
            latitude,
        }
    };
    /**
    * Creates a new values tooltip
    */
    createValuesTooltip(values) {
        if (this.valuesTooltipElement) {
            this.valuesTooltipElement.parentNode.removeChild(this.valuesTooltipElement);
        }
        this.valuesTooltipElement = document.createElement('div');
        this.valuesTooltipElement.className = 'ol-tooltip-values-container';
        this.addValuesToTooltip(values);
        this.valuesTooltipOverlay = new ol.Overlay({
            element: this.valuesTooltipElement,
            positioning: 'bottom-center',
            offset: [0, -15],
            stopEvent: false,
            insertFirst: false,
        });
        this.map.addOverlay(this.valuesTooltipOverlay);
    }
    /**
     * Displays the calculated values for the drawn feature in the measure tooltip.
     * Clears the tooltip first, then loops through the calculatedValues object and
     * creates a new paragraph element for each unit of measure with the rounded value
     * and unit of measure text. Appends the paragraph elements to the measure tooltip.
     *
     * @returns {void}
     */
    addValuesToTooltip(calcValues) {
        const {  display_name, partner_id, area, longitude, latitude } = this.props.record.data
        const partnerName = partner_id?.[1] ?? 'No partner'
        const landName = display_name ?? 'No land name'
        this.valuesTooltipElement.innerHTML = `
            <div class="ol-tooltip-values-title">
                <p>${landName}</p>
            </div>
            <div class="ol-tooltip-values-content">
                <p>
                    Partner: ${partnerName}
                </p>
            </div>
        `
        const $toolTipContent = this.valuesTooltipElement.querySelector('.ol-tooltip-values-content')
        const objValues = calcValues ? calcValues : { area, longitude, latitude }
        for (const [unit, value] of Object.entries(objValues)) {
            const meassureUnit = document.createElement('p');
            const roundedValue = value.toFixed(2)
            meassureUnit.textContent = `${unit}: ${roundedValue}`;
            $toolTipContent.appendChild(meassureUnit);
        }
    }

    /**
     * Saves the land values to the DB.
     * @param {Object} values - The land values to save.
     * @param {number} values.area - The area of the land.
     * @param {number} values.longitude - The longitude of the land.
     * @param {number} values.latitude - The latitude of the land.
     * @returns {Promise<void>} A promise that resolves when the values are saved.
     */
    async saveValues(values) {
        const { area, longitude, latitude } = values;
        await this.orm.call(
            "project.agriculture.land",
            "save_land_values",
            [{
                id: this.props.record?.data?.id ?? false,
                area, 
                longitude, 
                latitude
            }]
        );
    }
    // Maybe it's a better idea to create a drawinState, with a pencil icon,
    // and to create a form to add fields like Nombre de parcela, partner, 
    // Ubicación geográfica (latitud y longitud) y Área en hectáreas and once the submit button is clicked
    // we can create the feature and save it to the database
    handleActionModes(e) {

    }
}

FieldGeoEngineEditMap.template = "base_geoengine.FieldGeoEngineEditMap";

FieldGeoEngineEditMap.props = {
    ...standardFieldProps,
    opacity: {type: Number, optional: true},
    color: {type: String, optional: true},
};

FieldGeoEngineEditMap.extractProps = ({attrs}) => {
    return {
        opacity: attrs.options.opacity,
        color: attrs.options.color,
    };
};

export class FieldGeoEngineEditMapMultiPolygon extends FieldGeoEngineEditMap {
    setup() {
        this.geoType = "MultiPolygon";
        super.setup();
    }
}

export class FieldGeoEngineEditMapPolygon extends FieldGeoEngineEditMap {
    setup() {
        this.geoType = "Polygon";
        super.setup();
    }
}

export class FieldGeoEngineEditMapPoint extends FieldGeoEngineEditMap {
    setup() {
        this.geoType = "Point";
        super.setup();
    }
}

export class FieldGeoEngineEditMapMultiPoint extends FieldGeoEngineEditMap {
    setup() {
        this.geoType = "MultiPoint";
        super.setup();
    }
}

export class FieldGeoEngineEditMapLine extends FieldGeoEngineEditMap {
    setup() {
        this.geoType = "LineString";
        super.setup();
    }
}

export class FieldGeoEngineEditMapMultiLine extends FieldGeoEngineEditMap {
    setup() {
        this.geoType = "MultiLineString";
        super.setup();
    }
}

registry.category("fields").add("geo_multi_polygon", FieldGeoEngineEditMapMultiPolygon);
registry.category("fields").add("geo_polygon", FieldGeoEngineEditMapPolygon);
registry.category("fields").add("geo_point", FieldGeoEngineEditMapPoint);
registry.category("fields").add("geo_multi_point", FieldGeoEngineEditMapMultiPoint);
registry.category("fields").add("geo_line", FieldGeoEngineEditMapLine);
registry.category("fields").add("geo_multi_line", FieldGeoEngineEditMapMultiLine);
