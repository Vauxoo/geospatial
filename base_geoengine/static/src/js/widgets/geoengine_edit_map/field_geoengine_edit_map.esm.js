/** @odoo-module **/

/**
 * Copyright 2023 ACSONE SA/NV
 */

import {loadBundle} from "@web/core/assets";
import { session } from "@web/session";
import {registry} from "@web/core/registry";
import {useService, useOwnedDialogs} from "@web/core/utils/hooks";
import {WarningDialog} from "@web/core/errors/error_dialogs";
import {standardFieldProps} from "@web/views/fields/standard_field_props";
import { 
    CUSTOM_LAYERS,
    FEATURE_OPACITY,
    POLYGON_TYPES
} from "../../constants";

import {Component, onMounted, onRendered, onWillStart, useEffect} from "@odoo/owl";

export class FieldGeoEngineEditMap extends Component {
    setup() {
        // Allows you to have a unique id if you put the same field in the view several times
        this.id = `map_${Date.now()}`;
        this.orm = useService("orm");
        this.addDialog = useOwnedDialogs();

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
            this.createLayers(this.props.record.data?.default_map_layer);
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

    /**
     * Displays geo data on the map using the collection of features.
     */
    createVectorLayer(colorHex="#0000f5", includeLabel=false) {
        this.features = new ol.Collection();
        this.source = new ol.source.Vector({features: this.features});
        const color = chroma(colorHex).alpha(FEATURE_OPACITY).css();
        const darkenColor = chroma(colorHex).darken(1).css();
        const { Fill, Stroke, Style, Text } = ol.style;
        const { Vector } = ol.layer;
        const fill = new Fill({color});
        const stroke = new Stroke({
            color: darkenColor,
            width: 5,
        });
        const polygonStyle = new Style({
            fill,
            stroke
        })
        if(!includeLabel) {
            return new Vector({
                source: this.source,
                style: polygonStyle
            });
        }
        const labelStyle = new Style({
            text: new Text({
                font: 'bold 12px Calibri,sans-serif',
                overflow: true,
                fill: new Fill({
                    color: '#000',
                })
            }),
        });
        return new Vector({
            source: this.source,
            style: feature => {
                const label = feature.get("name") || "";
                labelStyle.getText().setText(label);
                return [polygonStyle, labelStyle];
            }
        })
    }

    /**
     * Call the method that creates the layer to display the geo data on the map.
     */
    createLayers(activeLayer) {
        this.vectorLayer = this.createVectorLayer();
        this.layer_list = []
        this.osmLayer = new ol.layer.Tile({
            source: new ol.source.OSM(),
            visible: !this.mapBoxToken,
            properties: {
                layerName: 'osm',
                image: 'base_geoengine/static/src/images/osm_view.png'
            }
        });
        this.layer_list.push(this.osmLayer)
        if (!!this.mapBoxToken) {
            CUSTOM_LAYERS.forEach(({layerName, layerURL, image}) => {
                const layer = new ol.layer.Tile({
                    source: new ol.source.XYZ({
                        url: `${layerURL}${this.mapBoxToken}`,
                    }),
                    visible: false,
                    properties: { layerName, image }
                })
                this.layer_list.push(layer)
            })
            const defaultLayer = this.layer_list.find(layer =>layer.getProperties().layerName === activeLayer)
            defaultLayer.setVisible(true)
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
            // TODO: check this part
            // this.mainLand = ft.getGeometry();
            // const extent = this.mainLand.getExtent();
            // this.mainLandCenter = ol.extent.getCenter(extent);
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
                this.createTooltipInfo();
                this.sketch = e.feature;
                this.tooltipCoord = e.coordinate;
                this.infoTooltipElement.textContent = "Click to continue drawing the Property Boundary"
                this.listener = this.sketch.getGeometry().on("change", e => {
                    const geom = e.target;
                    this.tooltipCoord = geom.getInteriorPoint().getCoordinates();
                    this.infoTooltipOverlay.setPosition(this.tooltipCoord);
                })
            })
            
            this.drawInteraction.on("drawend", async (e) => {
                this.map.removeOverlay(this.infoTooltipOverlay);
                this.mainLand = e.feature.getGeometry();
                const extent = this.mainLand.getExtent();
                this.mainLandCenter = ol.extent.getCenter(extent);
                this.onUIChange(this.mainLand);
                this.createValuesTooltip();
                this.valuesTooltipOverlay.setPosition(this.tooltipCoord)
                this.resetMeasureTooltip()
                ol.Observable.unByKey(this.listener);
            });

        } else {
            void (
                this.drawInteraction &&
                this.map.removeInteraction(this.drawInteraction)
            );
            const polygonTypeControl = this.createPolygonTypeControl();
            this.polygonTypeControl = new ol.control.Control({element: polygonTypeControl});
            this.map.addControl(this.polygonTypeControl);
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

        const element = this.createTrashControl();

        this.clearmapControl = new ol.control.Control({element: element});

        this.map.addControl(this.clearmapControl);

        if (!!this.mapBoxToken) {
            const elementLayers = this.createLayersControl();

            this.layersControl = new ol.control.Control({element: elementLayers});

            this.map.addControl(this.layersControl);
        }
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
        const tooltip = document.createElement("span");
        tooltip.innerHTML = "Remove item";
        tooltip.className = "custom-button-tooltip";
        const element = document.createElement("div");
        element.className = "ol-clear ol-unselectable ol-control action-button";
        element.appendChild(button);
        element.appendChild(tooltip);
        return element;
    }

    createPolygonTypeControl() {
        this.selectPolygonType = document.createElement("select");

        this.selectPolygonType.addEventListener("change", e => {
            this.selectPolygonType.style.backgroundColor = e.target.value;
            this.createDrawInteraction(e.target.value)
        })
        this.selectPolygonType.className = `form-select form-select-lg ol-polygon-type-control`;
        const defaultOption = document.createElement("option");
        defaultOption.value = "";
        defaultOption.textContent = "Choose the type of land to draw";
        defaultOption.selected = true;
        defaultOption.disabled = true; 
        this.selectPolygonType.appendChild(defaultOption);
        POLYGON_TYPES.forEach(type => {
            const option = document.createElement("option");
            option.textContent = type.name;
            option.value = type.color;
            option.style.backgroundColor = type.color;
            this.selectPolygonType.appendChild(option);
        });
        return this.selectPolygonType;
    }

    createDrawInteraction(landColor) {
        if(this.drawInteraction) this.map.removeInteraction(this.drawInteraction);
        const { name:polygonName } = POLYGON_TYPES.find(type => type.color === landColor);
        const vectorLayer = this.createVectorLayer(landColor, true);
        const drawInteraction = new ol.interaction.Draw({
            type: this.geoType,
            source: this.source,
            condition: e => {
                const coordinate = e.coordinate;
                const point = new ol.geom.Point(coordinate);
                const isInside = this.mainLand.intersectsExtent(point.getExtent());
                if (!isInside) {
                    this.addDialog(WarningDialog, {
                        title: this.env._t("Warning"),
                        message: this.env._t(
                            "The land you are trying to draw is outside of the Property Boundary."
                        ),
                    });
                }
                return isInside;
            }
        });
        this.map.addLayer(vectorLayer);
        this.map.addInteraction(drawInteraction);
        drawInteraction.on("drawstart", e => {
            this.createTooltipInfo();
            this.sketch = e.feature;
            this.tooltipCoord = e.coordinate;
            this.infoTooltipElement.textContent = `Click to continue drawing the ${polygonName} land`
            this.listener = this.sketch.getGeometry().on("change", e => {
                const geom = e.target;
                this.tooltipCoord = geom.getInteriorPoint().getCoordinates();
                this.infoTooltipOverlay.setPosition(this.tooltipCoord);
            })
        });
        drawInteraction.on("drawend", e => {
            this.map.removeInteraction(drawInteraction);
            this.map.removeOverlay(this.infoTooltipOverlay);
            const feature = e.feature;
            feature.set("name", polygonName);
            this.resetMeasureTooltip()
        });
    }

    /**
     * Create the button that allows you to draw on the map.
     * @returns the div in which the button is located.
     */
    createDrawControl() {
        const button = document.createElement("button");
        button.innerHTML = '<i class="fa fa-pencil"/>';
        button.addEventListener("click", () => {
        });
        const element = document.createElement("div");
        element.className = "ol-control ol-action-mode-draw action-button";
        element.appendChild(button);
        return element;
    }

    createEditControl() {
        const button = document.createElement("button");
        button.innerHTML = '<i class="fa fa-edit"/>';
        button.addEventListener("click", () => {
            this.actionMode = ACTION_MODES.EDIT
        });
        const element = document.createElement("div");
        element.className = "ol-control ol-action-mode-edit action-button";
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
    createLayersControl() {
        const layersContainer = document.createElement("div");
        layersContainer.classList.add("ol-layers-container");
        const elementLayers = document.createElement("div");
        elementLayers.classList.add("ol-layers-element");
        layersContainer.appendChild(elementLayers);
        this.layer_list.forEach(layer => {
            const layerName = layer.getProperties().layerName;
            const bgImage = layer.getProperties().image;
            const button = document.createElement("button");
            if (layerName === "satellite") button.classList.add("text-white");
            button.id = layerName;
            button.textContent = layerName;
            button.style.backgroundImage = `url(${bgImage})`;
            button.addEventListener("click", e => {
                this.layer_list.forEach(l => l.setVisible(l.getProperties().layerName === e.target.id));
            });
            elementLayers.appendChild(button);
        });

        return layersContainer;
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
                zoom: 6,
            }),
        });
        this.map.addLayer(this.vectorLayer);
        const snap = new ol.interaction.Snap({source: this.source});
        this.map.addInteraction(snap);
        this.format = new ol.format.GeoJSON({
            internalProjection: this.map.getView().getProjection(),
            externalProjection: "EPSG:" + this.srid,
        });
        if (!this.props.readonly) {
            this.setupControls();
        }
        if(this.mapBoxToken) {
            this.map.on('pointermove', (e) => {
                const feature = this.map.forEachFeatureAtPixel(e.pixel, f => f);
                if (feature) {
                    if (this.mainLand) {
                        this.valuesTooltipOverlay.setPosition(this.mainLandCenter);
                        return;
                    }
                }
                if(this.valuesTooltipOverlay) this.valuesTooltipOverlay.setPosition(undefined)
            });
        }
    }
    /**
     * Creates a new info tooltip
     */
    createTooltipInfo() {
        if (this.infoTooltipElement) {
            this.infoTooltipElement.parentNode.removeChild(this.infoTooltipElement);
        }
        this.infoTooltipElement = document.createElement('div');
        this.infoTooltipElement.className = 'ol-tooltip ol-tooltip-measure';
        this.infoTooltipOverlay = new ol.Overlay({
            element: this.infoTooltipElement,
            offset: [15, 0],
            positioning: 'bottom-center',
            stopEvent: false,
            insertFirst: false,
        });
        this.map.addOverlay(this.infoTooltipOverlay);
    }
    /**
     * Resets the values of the measure tooltip element and the sketch, so that a new
     * tooltip can be created.
     * @returns {void}
     */
    resetMeasureTooltip() {
        // unset sketch
        this.sketch = null;
        this.infoTooltipElement = null;
    }
    /**
    * Creates a new values tooltip
    */
    createValuesTooltip() {
        if (this.valuesTooltipElement) {
            this.valuesTooltipElement.parentNode.removeChild(this.valuesTooltipElement);
        }
        this.valuesTooltipElement = document.createElement('div');
        this.valuesTooltipElement.className = 'ol-tooltip-values-container';
        this.addValuesToTooltip();
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
     * @returns {void}
     */
    addValuesToTooltip() {
        const { display_name, partner_id, area, longitude, latitude } = this.props.record.data
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
        const values =  { area, longitude, latitude }
        for (const [unit, value] of Object.entries(values)) {
            const meassureUnit = document.createElement('p');
            const roundedValue = value.toFixed(2)
            meassureUnit.textContent = `${unit}: ${roundedValue}`;
            $toolTipContent.appendChild(meassureUnit);
        }
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
